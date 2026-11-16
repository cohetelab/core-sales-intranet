import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { buildDigest } from "@/lib/lead-digest";
import { SALES_REPS } from "@/lib/sales-reps";
import { getSnapshot } from "@/lib/sheet-source";

// 알림(Slack) 보내기. 웹훅 주소는 서버 환경변수 SLACK_WEBHOOK_URL에서만 읽고 화면으로 내보내지 않는다.
// 주소는 Slack 수신 웹훅 형식(https://hooks.slack.com/services/…)만 허용한다(개발 중에는 이 PC의 가짜 서버도 허용).
const SLACK_PREFIX = "https://hooks.slack.com/services/";
const DEV_PREFIX = "http://127.0.0.1:";

export function webhookUrl(): string | null {
  const u = (process.env.SLACK_WEBHOOK_URL ?? "").trim();
  if (u.startsWith(SLACK_PREFIX) || (process.env.NODE_ENV !== "production" && u.startsWith(DEV_PREFIX))) return u;
  return null;
}

export const digestConfigured = () => webhookUrl() !== null;

const sha = (s: string) => createHash("sha256").update(s).digest();
export const sameSecret = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

function appUrl(): string | undefined {
  const a = (process.env.APP_URL ?? "").trim();
  if (/^https:\/\/[^\s]+$/.test(a)) return a;
  const v = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  return v ? `https://${v}` : undefined;
}

export async function digestText(): Promise<string> {
  const snap = await getSnapshot({ fresh: true });
  return buildDigest(snap.customers, Date.now(), SALES_REPS, { appUrl: appUrl(), hideNames: process.env.DIGEST_HIDE_NAMES === "1" });
}

export type SendResult = { ok: true; text: string } | { ok: false; reason: string };

// Slack 수신 웹훅: POST + JSON {"text": …}, 성공하면 본문이 "ok"로 돌아온다.
export async function sendDigest(): Promise<SendResult> {
  const url = webhookUrl();
  if (!url) return { ok: false, reason: "not_configured" };
  const text = await digestText();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    const body = (await res.text()).trim().slice(0, 100);
    if (!res.ok || body !== "ok") return { ok: false, reason: `slack_${res.status}` };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "slack_unreachable" };
  }
}
