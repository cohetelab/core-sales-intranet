import { NextResponse } from "next/server";

import { formatContract } from "@/lib/lead-fields";
import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError, setContract, writeFields, type FieldResult } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;
const MAX_AMOUNT = 1_000_000_000_000;

// 계약 전환: 시트의 '단계' 칸에 '계약'을 기록한다(그 고객의 모든 문의 행). 계약 금액을 같이 보내면 가장 최근 행의 '계약 금액' 칸에도 쓴다.
// 그 뒤로 이 고객은 리드 목록에서 빠진다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let id = "";
  let amount: number | null = null;
  try {
    const raw = await req.text();
    if (raw.length > 1000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = JSON.parse(raw) as { id?: unknown; amount?: unknown };
    id = String(body.id ?? "");
    if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
      if (typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount <= 0 || body.amount > MAX_AMOUNT) {
        return NextResponse.json({ error: "bad_amount" }, { status: 400 });
      }
      amount = body.amount;
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!ID.test(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const results = await setContract([id], user);
    let contract: FieldResult | undefined;
    if (amount !== null && results[id]?.ok) contract = (await writeFields(id, { contract: formatContract(amount) }, null, user)).contract;
    return NextResponse.json({ results, contract });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("leads: convert failed", code);
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}
