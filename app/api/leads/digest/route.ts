import { NextResponse } from "next/server";

import { digestConfigured, digestText, sendDigest } from "@/lib/digest-server";
import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastSentAt = 0;
const COOLDOWN_MS = 15_000; // 버튼을 연달아 눌러 알림이 쏟아지지 않게

// 로그인한 사람만: 지금 보낼 알림 미리보기와 Slack 연결 여부(웹훅 주소 값은 내보내지 않는다).
export async function GET(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sessionUser(req)) return NextResponse.json({ error: "login" }, { status: 401 });
  try {
    return NextResponse.json({ configured: digestConfigured(), preview: await digestText() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}

// 로그인한 사람만: 지금 한 번 보내 본다(연결 확인용).
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!sessionUser(req)) return NextResponse.json({ error: "login" }, { status: 401 });
  if (!digestConfigured()) return NextResponse.json({ sent: false, reason: "not_configured" });
  if (Date.now() - lastSentAt < COOLDOWN_MS) return NextResponse.json({ sent: false, reason: "too_soon" }, { status: 429 });
  lastSentAt = Date.now();
  try {
    const r = await sendDigest();
    return NextResponse.json(r.ok ? { sent: true } : { sent: false, reason: r.reason }, { status: r.ok ? 200 : 502 });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    return NextResponse.json({ sent: false, reason: code }, { status: 502 });
  }
}
