import { NextResponse } from "next/server";

import { digestConfigured, sameSecret, sendDigest } from "@/lib/digest-server";
import { leadsConfigured } from "@/lib/leads-auth";
import { SheetError } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel 크론이 평일 아침에 호출한다(GET, Authorization: Bearer CRON_SECRET). 정해진 시각에 Slack으로 영업 알림을 보낸다.
// 크론은 실패해도 다시 시도하지 않고 드물게 두 번 호출될 수 있어서, 같은 글이 두 번 가도 문제없게 읽기만 한다.
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !sameSecret(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  if (!leadsConfigured()) return NextResponse.json({ ok: true, sent: false, reason: "sheet_not_configured" });
  if (!digestConfigured()) return NextResponse.json({ ok: true, sent: false, reason: "not_configured" });

  try {
    const r = await sendDigest();
    if (!r.ok) {
      console.error("digest: send failed", r.reason);
      return NextResponse.json({ ok: false, sent: false, reason: r.reason }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("digest: build failed", code);
    return NextResponse.json({ ok: false, sent: false, reason: code }, { status: 502 });
  }
}
