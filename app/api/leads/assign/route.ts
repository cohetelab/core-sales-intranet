import { NextResponse } from "next/server";

import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { OWNER_OPTIONS } from "@/lib/sales-reps";
import { SheetError, assignOwners } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;
const MAX_IDS = 1000;

// 담당 영업 배정을 시트의 '담당자' 칸에 기록한다. 고객별 결과를 돌려준다(일부만 실패할 수 있다).
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let body: { ids?: unknown; owner?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 100_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && ID.test(x)) : [];
  const owner = typeof body.owner === "string" ? body.owner : "";
  if (ids.length === 0 || ids.length > MAX_IDS || ids.length !== (body.ids as unknown[]).length || !OWNER_OPTIONS.includes(owner)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    return NextResponse.json({ results: await assignOwners(Array.from(new Set(ids)), owner, user) });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("leads: assign failed", code);
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}
