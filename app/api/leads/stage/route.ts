import { NextResponse } from "next/server";

import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError, setStage } from "@/lib/sheet-source";
import type { DealStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;
const STAGES: readonly DealStage[] = ["lead", "discovery", "proposal", "won"];

// 파이프라인에서 카드를 옮길 때: 시트의 '단계' 칸(그 고객의 모든 문의 행)을 단계에 맞는 글자(상담·제안·계약, 리드는 비움)로 바꾼다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let id = "";
  let stage = "";
  try {
    const raw = await req.text();
    if (raw.length > 1000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = JSON.parse(raw) as { id?: unknown; stage?: unknown };
    id = String(body.id ?? "");
    stage = String(body.stage ?? "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!ID.test(id) || !(STAGES as readonly string[]).includes(stage)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    return NextResponse.json({ results: await setStage([id], stage as DealStage, user) });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    const detail = error instanceof SheetError && error.message !== error.code ? error.message : undefined;
    console.error("leads: stage failed", code);
    return NextResponse.json({ error: "sheet_error", code, detail }, { status: 502 });
  }
}
