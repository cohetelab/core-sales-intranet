import { NextResponse } from "next/server";

import { leadsConfigured, sessionIsAdmin, sessionUser } from "@/lib/leads-auth";
import { SettlementError, getSettlement, settlementConfigured } from "@/lib/settlement-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// 정산 시트(읽기 전용). 인플루언서별 지급액과 광고주 계약 매출이 들어 있어서 관리자만 볼 수 있다.
// 로그인 쿠키가 /api/leads 아래로만 전달되므로 주소도 그 아래에 둔다.
export async function GET(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sessionUser(req)) return NextResponse.json({ error: "login" }, { status: 401 });
  if (!sessionIsAdmin(req)) return NextResponse.json({ error: "admin_only" }, { status: 403, headers: NO_STORE });
  if (!settlementConfigured()) return NextResponse.json({ error: "settlement_not_configured" }, { status: 503, headers: NO_STORE });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    return NextResponse.json(await getSettlement(fresh), { headers: NO_STORE });
  } catch (error) {
    const code = error instanceof SettlementError ? error.code : "server_error";
    const detail = error instanceof SettlementError && error.message !== error.code ? error.message : undefined;
    console.error("settlement: read failed", code);
    return NextResponse.json({ error: "sheet_error", code, detail }, { status: 502, headers: NO_STORE });
  }
}
