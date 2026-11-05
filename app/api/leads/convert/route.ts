import { NextResponse } from "next/server";

import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError, setContract } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;

// 계약 전환: 시트의 '단계' 칸에 '계약'을 기록한다. 그 뒤로 이 고객은 리드 목록에서 빠진다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let id = "";
  try {
    const raw = await req.text();
    if (raw.length > 1000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    id = String((JSON.parse(raw) as { id?: unknown }).id ?? "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!ID.test(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    return NextResponse.json({ results: await setContract([id], user) });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("leads: convert failed", code);
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}
