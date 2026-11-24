import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { DEFAULT_ADMINS, SALES_REPS } from "@/lib/sales-reps";

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

// 관리자: 팀 공용 화면 설정과 다른 사람의 월 목표를 바꿀 수 있다. 이름 목록은 환경변수 LEADS_ADMINS(없으면 기본값).
// 로그인이 "이름 고르기 + 공용 비밀번호"라서 이름만으로는 관리자를 가려낼 수 없다. 그래서 LEADS_ADMIN_PASSCODE를 설정하면
// 관리자 이름으로는 그 비밀번호로만 들어갈 수 있고(공용 비밀번호는 거절), 세션에 관리자 표시가 서명으로 들어간다.
// 설정하지 않으면 관리자 이름도 공용 비밀번호로 들어가므로 이름만 고르면 관리자가 된다(adminProtected=false로 화면에 알린다).
export function adminNames(): string[] {
  const env = (process.env.LEADS_ADMINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const names = env.length ? env : [...DEFAULT_ADMINS];
  return names.filter((n) => (SALES_REPS as readonly string[]).includes(n));
}
export const isAdminName = (name: string) => adminNames().includes(name);
export const adminProtected = () => Boolean(process.env.LEADS_ADMIN_PASSCODE);
export function adminPasscodeOk(input: string) {
  const expected = process.env.LEADS_ADMIN_PASSCODE;
  return !!expected && safeEqual(input, expected);
}

// 서명 키는 비밀번호와 시트 토큰을 함께 쓴다. 어느 쪽을 바꿔도 발급된 세션이 모두 무효가 된다. 관리자 세션은 관리자 비밀번호도 키에 넣어
// 관리자 비밀번호를 바꾸면 관리자 세션만 무효가 된다.
const sessionKey = (admin: boolean) => `${process.env.LEADS_PASSCODE ?? ""}\u0000${process.env.SHEET_SCRIPT_TOKEN ?? ""}${admin ? `\u0000admin:${process.env.LEADS_ADMIN_PASSCODE ?? ""}` : ""}`;
const sign = (payload: string, admin: boolean) => createHmac("sha256", sessionKey(admin)).update(`leads-session-v1:${payload}`).digest("base64url");

export function passcodeOk(input: string) {
  const expected = process.env.LEADS_PASSCODE;
  return !!expected && safeEqual(input, expected);
}

export function newSession(name: string, now = Date.now(), admin = false) {
  const payload = Buffer.from(JSON.stringify({ n: name, e: now + SESSION_SECONDS * 1000, ...(admin ? { a: 1 } : {}) })).toString("base64url");
  return `${payload}.${sign(payload, admin)}`;
}

function cookieValue(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// 유효한 세션이면 로그인한 영업 이름과 관리자 로그인 여부, 아니면 null. 관리자 표시(a)는 서명에 포함돼서 위조할 수 없다.
function readSession(req: Request): { name: string; admin: boolean } | null {
  if (!leadsConfigured()) return null;
  const [payload, mac] = cookieValue(req, SESSION_COOKIE).split(".");
  if (!payload || !mac) return null;
  try {
    const { n, e, a } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { n?: unknown; e?: unknown; a?: unknown };
    const admin = a === 1;
    if (!safeEqual(mac, sign(payload, admin))) return null;
    if (typeof n !== "string" || typeof e !== "number" || e <= Date.now()) return null;
    return (SALES_REPS as readonly string[]).includes(n) ? { name: n, admin } : null;
  } catch {
    return null;
  }
}

// 유효한 세션이면 로그인한 영업 이름, 아니면 null
export const sessionUser = (req: Request): string | null => readSession(req)?.name ?? null;

// 관리자인가: 관리자 이름이어야 하고, 관리자 비밀번호가 설정돼 있으면 그 비밀번호로 로그인한 세션이어야 한다.
export function sessionIsAdmin(req: Request): boolean {
  const s = readSession(req);
  if (!s || !isAdminName(s.name)) return false;
  return adminProtected() ? s.admin : true;
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
