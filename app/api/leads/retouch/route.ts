import { NextResponse } from "next/server";

import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SALES_REPS } from "@/lib/sales-reps";
import { SheetError, retouchAssign } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;
const MAX_IDS = 150; // 한 번에 보내는 고객 수(많은 고객은 화면이 나눠서 보낸다)

// 리터치 풀 배정: 묵은 고객을 영업에게 다시 배정한다(시트 '담당자' 칸). reopen이면 종료된 고객의 '단계'를 비워 되살린다.
// 상담 내용에 "(메모) 리터치 풀 배정 → Ian" 줄이 남고, 다음 액션이 비어 있으면 채워진다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let ids: string[] = [];
  let owner = "";
  let reopen = false;
  try {
    const raw = await req.text();
    if (raw.length > 12_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = JSON.parse(raw) as { ids?: unknown; owner?: unknown; reopen?: unknown };
    if (!Array.isArray(body.ids)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    ids = body.ids.map((v) => String(v));
    owner = String(body.owner ?? "");
    reopen = body.reopen === true;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => ID.test(id)) || !(SALES_REPS as readonly string[]).includes(owner)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    return NextResponse.json({ results: await retouchAssign(ids, owner, reopen, user) });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    const detail = error instanceof SheetError && error.message !== error.code ? error.message : undefined;
    console.error("leads: retouch failed", code);
    return NextResponse.json({ error: "sheet_error", code, detail }, { status: 502 });
  }
}
