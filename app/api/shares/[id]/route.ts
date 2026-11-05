import { adminAuthenticated, sameOrigin } from "@/lib/share-auth";
import { deleteShare } from "@/lib/share-snapshots";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  if (!(await adminAuthenticated())) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const removed = await deleteShare((await params).id);
    return Response.json({ removed }, { status: removed ? 200 : 404 });
  } catch {
    return Response.json({ error: "전달 링크를 철회하지 못했습니다." }, { status: 500 });
  }
}
