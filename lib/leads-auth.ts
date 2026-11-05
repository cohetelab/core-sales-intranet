import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { SALES_REPS } from "@/lib/sales-reps";

// 리드 화면(시트 연동) 접근 제한. 공용 비밀번호를 한 번 맞추고 "나는 누구"를 고르면
// 이름이 들어 있는 서명된 httpOnly 쿠키를 발급한다. 이름은 시트 수정 기록(누가 배정했는지)에 쓰인다.
// 로그인이 없는 인트라넷에서 고객 연락처가 든 시트를 서버가 읽어 보여주므로, 이 쿠키 없이는 아무것도 내보내지 않는다.

export const SESSION_COOKIE = "leads_session";
export const SESSION_PATH = "/api/leads";
export const SESSION_SECONDS = 14 * 24 * 60 * 60;

const WINDOW_MS = 10 * 60_000;
export const FAIL_LIMIT = 8; // 10분당 비밀번호 실패(IP별)
const fails = new Map<string, number[]>(); // 서버리스 인스턴스 메모리 기준의 최선 노력 제한

export const leadsConfigured = () =>
  Boolean(process.env.SHEET_SCRIPT_URL && process.env.SHEET_SCRIPT_TOKEN && process.env.LEADS_PASSCODE);

const sha = (s: string) => createHash("sha256").update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

// 서명 키는 비밀번호와 시트 토큰을 함께 쓴다. 어느 쪽을 바꿔도 발급된 세션이 모두 무효가 된다.
const sessionKey = () => `${process.env.LEADS_PASSCODE ?? ""}\u0000${process.env.SHEET_SCRIPT_TOKEN ?? ""}`;
const sign = (payload: string) => createHmac("sha256", sessionKey()).update(`leads-session-v1:${payload}`).digest("base64url");

export function passcodeOk(input: string) {
  const expected = process.env.LEADS_PASSCODE;
  return !!expected && safeEqual(input, expected);
}

export function newSession(name: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ n: name, e: now + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function cookieValue(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// 유효한 세션이면 로그인한 영업 이름, 아니면 null
export function sessionUser(req: Request): string | null {
  if (!leadsConfigured()) return null;
  const [payload, mac] = cookieValue(req, SESSION_COOKIE).split(".");
  if (!payload || !mac || !safeEqual(mac, sign(payload))) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { n?: unknown; e?: unknown };
    if (typeof n !== "string" || typeof e !== "number" || e <= Date.now()) return null;
    return (SALES_REPS as readonly string[]).includes(n) ? n : null;
  } catch {
    return null;
  }
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function recent(ip: string, now: number) {
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(ip, list);
  return list;
}
export const loginBlocked = (ip: string) => recent(ip, Date.now()).length >= FAIL_LIMIT;
export const recordLoginFail = (ip: string) => recent(ip, Date.now()).push(Date.now());
export const clearLoginFails = (ip: string) => fails.delete(ip);

// 쓰기·로그인 요청은 같은 출처에서 온 것만 받는다(SameSite=Strict와 함께 쓰는 이중 방어).
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === new URL(req.url).origin);
}
