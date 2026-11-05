import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "core-sales-share-admin";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  return process.env.SHARE_ADMIN_PASSWORD ?? "";
}

export function configured() {
  return Boolean(secret() && process.env.BLOB_READ_WRITE_TOKEN);
}

export function passwordMatches(value: string) {
  const expected = secret();
  if (!expected) return false;
  return timingSafeEqual(createHash("sha256").update(value).digest(), createHash("sha256").update(expected).digest());
}

function signature(expires: string) {
  return createHmac("sha256", secret()).update(expires).digest("base64url");
}

export async function adminAuthenticated() {
  if (!configured()) return false;
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  const expected = signature(expires);
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export async function createAdminSession() {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  (await cookies()).set(COOKIE_NAME, `${expires}.${signature(expires)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}

// 틀린 관리자 암호를 연달아 넣는 걸 막는다. 서버리스 인스턴스 메모리 기준의 최선 노력 제한이라 인스턴스마다 따로 센다.
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const loginFails = new Map<string, { count: number; resetAt: number }>();

export function loginKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function loginBlocked(key: string) {
  const entry = loginFails.get(key);
  return Boolean(entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILS);
}

export function recordLoginFail(key: string) {
  const now = Date.now();
  const entry = loginFails.get(key);
  const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + FAIL_WINDOW_MS };
  current.count += 1;
  loginFails.set(key, current);
}

export function clearLoginFails(key: string) {
  loginFails.delete(key);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
