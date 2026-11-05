import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "outreach_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;

const sha = (s: string) => createHash("sha256").update(s).digest();

function safeEqual(a: string, b: string) {
  return timingSafeEqual(sha(a), sha(b));
}

// 화면 로그인: 비밀번호를 맞추면 "만료시각.HMAC" 쿠키를 발급하고, 서버가 만료와 서명을 매번 검사한다.
// 서명 키는 비밀번호와 에이전트 키를 함께 쓴다. 쿠키 값이 새도 비밀번호를 오프라인으로 추측하려면 두 값을 모두 알아야 하고,
// 어느 한쪽을 바꾸면 발급된 세션이 전부 무효가 된다(OUTREACH_API_KEY가 없으면 비밀번호만 쓴다).
function sessionKey(): string | null {
  const pw = process.env.OUTREACH_ADMIN_PASSWORD;
  return pw ? `${pw}\u0000${process.env.OUTREACH_API_KEY ?? ""}` : null;
}

const sign = (key: string, expires: string) =>
  createHmac("sha256", key).update(`outreach-session-v2:${expires}`).digest("hex");

export function newSession(now = Date.now()): string | null {
  const key = sessionKey();
  if (!key) return null;
  const expires = String(now + SESSION_SECONDS * 1000);
  return `${expires}.${sign(key, expires)}`;
}

export function passwordOk(input: string): boolean {
  const pw = process.env.OUTREACH_ADMIN_PASSWORD;
  return !!pw && safeEqual(input, pw);
}

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function isAdmin(req: Request): boolean {
  const key = sessionKey();
  const got = cookieValue(req, SESSION_COOKIE);
  if (!key || !got) return false;
  const [expires, mac] = got.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) <= Date.now()) return false;
  return safeEqual(mac, sign(key, expires));
}

// Aside(에이전트) 호출: x-outreach-key 헤더가 OUTREACH_API_KEY와 같아야 한다.
export function isAgent(req: Request): boolean {
  const key = process.env.OUTREACH_API_KEY;
  const got = req.headers.get("x-outreach-key");
  return !!key && !!got && safeEqual(got, key);
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const unauthorized = () => json({ error: "unauthorized" }, 401);
export const notConfigured = () =>
  json({ error: "서버 환경변수(SUPABASE_URL, SUPABASE_SECRET_KEY, OUTREACH_*)가 설정되지 않았습니다." }, 503);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
