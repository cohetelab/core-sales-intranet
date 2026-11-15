import { NextResponse } from "next/server";

import { CLOSE_REASONS, type CloseReason } from "@/lib/lead-cleanup";
import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError, closeCustomers, reopenCustomers } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;
const MAX_IDS = 150; // 한 번에 보내는 고객 수(많은 고객은 화면이 나눠서 보낸다)

// 정리 대기함: 고객을 종료 처리하거나(시트 '단계' = 실패/종료, 선택: 사유 기록) 종료를 해제한다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let ids: string[] = [];
  let action = "";
  let reason: CloseReason | null = null;
  try {
    const raw = await req.text();
    if (raw.length > 12_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = JSON.parse(raw) as { ids?: unknown; action?: unknown; reason?: unknown };
    if (!Array.isArray(body.ids)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    ids = body.ids.map((v) => String(v));
    action = String(body.action ?? "");
    if (body.reason !== undefined && body.reason !== null && body.reason !== "") {
      if (!(CLOSE_REASONS as readonly string[]).includes(String(body.reason))) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      reason = String(body.reason) as CloseReason;
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => ID.test(id)) || (action !== "close" && action !== "reopen")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const results = action === "close" ? await closeCustomers(ids, reason, user) : await reopenCustomers(ids, user);
    return NextResponse.json({ results });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    const detail = error instanceof SheetError && error.message !== error.code ? error.message : undefined;
    console.error("leads: close failed", code);
    return NextResponse.json({ error: "sheet_error", code, detail }, { status: 502 });
  }
}
