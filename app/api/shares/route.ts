import { adminAuthenticated, sameOrigin } from "@/lib/share-auth";
import { createShare, listShares, parseShareInput } from "@/lib/share-snapshots";

export const runtime = "nodejs";

export async function GET() {
  if (!(await adminAuthenticated())) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const shares = await listShares();
    return Response.json({ shares }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "전달 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  if (!(await adminAuthenticated())) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 2_000_000) return Response.json({ error: "전달 목록이 너무 큽니다." }, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(raw || "null"); } catch { return Response.json({ error: "전달 목록 JSON이 올바르지 않습니다." }, { status: 400 }); }
  const input = parseShareInput(parsed);
  if (!input) return Response.json({ error: "전달 목록 형식이 올바르지 않습니다." }, { status: 400 });
  try {
    const snapshot = await createShare(input);
    return Response.json({ share: snapshot }, { status: 201 });
  } catch {
    return Response.json({ error: "전달 링크를 발행하지 못했습니다." }, { status: 500 });
  }
}
