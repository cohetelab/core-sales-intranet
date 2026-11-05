import { NextResponse } from "next/server";

import { leadsConfigured, sessionUser } from "@/lib/leads-auth";
import { SNAPSHOT_BURST_MS, SheetError, getSnapshot } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 시트의 리드를 정리해서 돌려준다. 로그인(세션 쿠키)이 없으면 아무 데이터도 내보내지 않는다.
// ETag로 바뀐 게 없으면 본문 없이 304를 돌려서, 화면이 주기적으로 물어봐도 가볍다.
export async function GET(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  try {
    // ?fresh=1 : 주기적 확인(캐시는 2초까지만 재사용) · ?nocache=1 : 쓰기 직후·새로고침·로그인(캐시 없이 항상 새로 읽기)
    // 쓰기와 조회는 서버에서 서로 다른 함수로 실행될 수 있어 캐시를 공유하지 않으므로, 쓰기 직후에는 반드시 nocache로 읽는다.
    const params = new URL(req.url).searchParams;
    const snap = await getSnapshot(
      params.get("nocache") === "1" ? { fresh: true } : params.get("fresh") === "1" ? { maxAgeMs: SNAPSHOT_BURST_MS } : {}
    );
    const etag = `"${snap.etag}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-store" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return NextResponse.json(
      { user, customers: snap.customers, meta: snap.meta, fetchedAt: snap.fetchedAt, sheetUrl: snap.sheetUrl, gid: snap.gid },
      { headers }
    );
  } catch (error) {
    // 시트 서버의 내부 문구는 내보내지 않고 분류만 알려 준다.
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("leads: sheet read failed", code);
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}
