import "server-only";

import { parseSettlementSheet, type ParsedSettlement } from "@/lib/settlement-parse";

// 정산 시트와의 연결부(읽기 전용). 정산 시트에 붙인 Apps Script 웹 앱(integrations/settlement-bridge)을 호출한다.
// 문의 시트 연결(SHEET_SCRIPT_*)과 별개의 주소·토큰(SETTLEMENT_SCRIPT_URL · SETTLEMENT_SCRIPT_TOKEN)을 쓴다. 시트에 쓰는 동작은 없다.

const TIMEOUT_MS = 25_000;
const CACHE_MS = 30_000;
const MAX_ROWS = 20_000;

export class SettlementError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

// 운영에서는 구글 Apps Script 주소만 허용한다(서버가 임의의 주소를 호출하게 되는 것을 막는다). 로컬 개발·시험에서는 localhost도 허용한다.
function scriptUrl() {
  try {
    const u = new URL(process.env.SETTLEMENT_SCRIPT_URL ?? "");
    const google = u.protocol === "https:" && /(^|\.)script\.google(usercontent)?\.com$/.test(u.hostname);
    const local = process.env.NODE_ENV !== "production" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    return google || local ? u.toString() : null;
  } catch {
    return null;
  }
}

export const settlementConfigured = () => Boolean(scriptUrl() && process.env.SETTLEMENT_SCRIPT_TOKEN);

export type SettlementSnapshot = ParsedSettlement & { fetchedAt: string; sheetUrl: string; sheetName: string; gid: number };

let cache: { at: number; value: SettlementSnapshot } | null = null;

async function readSheet(): Promise<{ values: string[][]; sheetName: string; sheetUrl: string; gid: number }> {
  const url = scriptUrl();
  const token = process.env.SETTLEMENT_SCRIPT_TOKEN;
  if (!url || !token) throw new SettlementError("not_configured");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token, action: "read" }),
      redirect: "follow", // Apps Script 웹 앱은 응답을 다른 주소로 한 번 넘겨 준다
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SettlementError("unreachable");
  }
  if (!res.ok) throw new SettlementError("upstream", `HTTP ${res.status}`);
  // 구글이 JSON이 아니라 HTML(로그인 요청·오류 화면)을 돌려주면 웹 앱 배포 설정(액세스: 모든 사용자)이나 주소가 잘못된 것이다.
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || data.ok !== true) {
    const detail = typeof data?.message === "string" ? data.message.slice(0, 160) : undefined;
    throw new SettlementError(typeof data?.error === "string" ? data.error : "bad_response", detail);
  }
  const values = data.values;
  if (!Array.isArray(values) || values.length > MAX_ROWS || !values.every((r) => Array.isArray(r))) throw new SettlementError("bad_response");
  return {
    values: values.map((r) => (r as unknown[]).map((c) => String(c ?? ""))),
    sheetName: typeof data.sheetName === "string" ? data.sheetName : "",
    sheetUrl: typeof data.sheetUrl === "string" ? data.sheetUrl : "",
    gid: typeof data.gid === "number" ? data.gid : 0,
  };
}

export async function getSettlement(fresh = false): Promise<SettlementSnapshot> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const sheet = await readSheet();
  const parsed = parseSettlementSheet(sheet.values);
  if (!parsed.ok) throw new SettlementError(parsed.error === "empty" ? "empty_sheet" : "no_header");
  const value: SettlementSnapshot = { ...parsed, fetchedAt: new Date().toISOString(), sheetUrl: sheet.sheetUrl, sheetName: sheet.sheetName, gid: sheet.gid };
  cache = { at: Date.now(), value };
  return value;
}
