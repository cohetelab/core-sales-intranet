import "server-only";

import { createHash } from "node:crypto";

import { parseInquiryRows, recordToCustomer, type LeadRecord } from "@/lib/lead-sheet";
import { UNASSIGNED } from "@/lib/sales-reps";
import type { Customer } from "@/lib/types";

// 문의 시트와의 연결부. 지금은 시트에 붙인 Apps Script 웹 앱(integrations/sheet-bridge)을 호출한다.
// 나중에 서비스 계정 방식으로 바꿀 때는 이 파일의 call()만 바꾸면 되고, 아래의 읽기·정리·쓰기 규칙은 그대로 쓴다.

const TIMEOUT_MS = 25_000;
const CACHE_MS = 10_000; // 화면이 캐시 설정 없이 물을 때
const BURST_MS = 2_000; // 화면이 최신을 요청할 때도 여러 명이 동시에 누르면 시트를 한 번만 읽는다
const MAX_ROWS = 50_000;
const CHUNK = 900; // Apps Script 한 번의 쓰기 요청 상한(1000)보다 작게

export class SheetError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

// 운영에서는 구글 Apps Script 주소만 허용한다(서버가 임의의 주소를 호출하게 되는 것을 막는다). 로컬 개발에서는 localhost도 허용.
function scriptUrl() {
  try {
    const u = new URL(process.env.SHEET_SCRIPT_URL ?? "");
    const google = u.protocol === "https:" && /(^|\.)script\.google(usercontent)?\.com$/.test(u.hostname);
    const local = process.env.NODE_ENV !== "production" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    return google || local ? u.toString() : null;
  } catch {
    return null;
  }
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = scriptUrl();
  if (!url || !process.env.SHEET_SCRIPT_TOKEN) throw new SheetError("not_configured");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: process.env.SHEET_SCRIPT_TOKEN, ...body }),
      redirect: "follow", // Apps Script 웹 앱은 응답을 다른 주소로 한 번 넘겨 준다
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SheetError("unreachable");
  }
  if (!res.ok) throw new SheetError("upstream", `HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || data.ok !== true) throw new SheetError(typeof data?.error === "string" ? data.error : "bad_response");
  return data;
}

export type Snapshot = {
  customers: Customer[];
  meta: Record<string, { row: number }>; // 고객 id → 시트에서 가장 최근 문의 행(시트에서 보기 링크용)
  records: Map<string, LeadRecord>; // 서버 안에서만 쓴다(쓰기 때 행 확인)
  fetchedAt: string;
  sheetUrl: string;
  gid: number;
  etag: string;
};

let cache: { at: number; value: Snapshot } | null = null;

// fresh: 캐시 없이 항상 새로 읽기(쓰기 직전). maxAgeMs: 이 시간보다 오래된 캐시만 버린다.
export async function getSnapshot(options: { fresh?: boolean; maxAgeMs?: number } = {}): Promise<Snapshot> {
  const maxAge = options.fresh ? 0 : (options.maxAgeMs ?? CACHE_MS);
  if (cache && Date.now() - cache.at < maxAge) return cache.value;

  const data = await call({ action: "read" });
  const values = data.values;
  if (!Array.isArray(values) || values.length > MAX_ROWS || !values.every((r) => Array.isArray(r))) throw new SheetError("bad_response");
  const parsed = parseInquiryRows(values.map((r) => (r as unknown[]).map((c) => String(c ?? ""))), true);
  if (!parsed.ok) throw new SheetError("parse", parsed.error);

  const fetchedAt = new Date().toISOString();
  const records = new Map(parsed.records.map((r) => [r.id, r]));
  const customers = parsed.records.map((r) => recordToCustomer(r, fetchedAt));
  const meta: Snapshot["meta"] = {};
  for (const r of parsed.records) meta[r.id] = { row: r.rowRefs[r.rowRefs.length - 1]?.row ?? 0 };
  const sheetUrl = typeof data.sheetUrl === "string" ? data.sheetUrl : "";
  const gid = typeof data.gid === "number" ? data.gid : 0;
  const etag = createHash("sha1").update(JSON.stringify(customers)).update(sheetUrl).digest("hex").slice(0, 20);

  const value: Snapshot = { customers, meta, records, fetchedAt, sheetUrl, gid, etag };
  cache = { at: Date.now(), value };
  return value;
}

export const SNAPSHOT_BURST_MS = BURST_MS;

export const invalidateSnapshot = () => {
  cache = null;
};

export type WriteResult = Record<string, { ok: boolean; reason?: string }>;

type CellUpdate = { row: number; stamp: string; phone: string; col: string; expect: string; value: string };

// 고객 1명은 시트의 여러 문의 행일 수 있다. 같은 값을 그 고객의 모든 행의 해당 칸에 쓴다.
async function writeColumn(ids: string[], col: "담당자" | "단계", value: string, user: string): Promise<WriteResult> {
  const snap = await getSnapshot({ fresh: true }); // 쓰기 직전에 시트를 새로 읽는다
  const results: WriteResult = {};
  const updates: CellUpdate[] = [];
  const owners: string[] = []; // updates[i]가 어느 고객 것인지

  for (const id of ids) {
    const rec = snap.records.get(id);
    if (!rec || rec.rowRefs.length === 0) {
      results[id] = { ok: false, reason: "not_found" };
      continue;
    }
    results[id] = { ok: true };
    for (const ref of rec.rowRefs) {
      const current = col === "담당자" ? ref.owner : ref.stage;
      if (current.trim() === value) continue; // 이미 같은 값
      updates.push({ row: ref.row, stamp: ref.stamp, phone: ref.phone, col, expect: current, value });
      owners.push(id);
    }
  }

  try {
    for (let i = 0; i < updates.length; i += CHUNK) {
      const data = await call({ action: "update", user, updates: updates.slice(i, i + CHUNK) });
      const list = Array.isArray(data.results) ? (data.results as { index: number; ok: boolean; reason?: string }[]) : [];
      for (const r of list) {
        const id = owners[i + r.index];
        if (id && !r.ok && results[id]?.ok) results[id] = { ok: false, reason: r.reason ?? "failed" };
      }
    }
  } finally {
    invalidateSnapshot();
  }
  return results;
}

export const assignOwners = (ids: string[], owner: string, user: string) =>
  writeColumn(ids, "담당자", owner === UNASSIGNED ? "" : owner, user);

export const setContract = (ids: string[], user: string) => writeColumn(ids, "단계", "계약", user);
