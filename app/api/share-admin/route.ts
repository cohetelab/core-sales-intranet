import {
  adminAuthenticated, clearAdminSession, clearLoginFails, configured, createAdminSession,
  loginBlocked, loginKey, passwordMatches, recordLoginFail, sameOrigin,
} from "@/lib/share-auth";

export async function GET() {
  return Response.json({ authenticated: await adminAuthenticated(), configured: configured() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  if (!configured()) return Response.json({ error: "관리자 저장소 설정이 필요합니다." }, { status: 503 });
  const key = loginKey(request);
  if (loginBlocked(key)) {
    return Response.json({ error: "시도 횟수를 넘었습니다. 15분 뒤에 다시 해 주세요." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.password !== "string" || !passwordMatches(body.password)) {
    recordLoginFail(key);
    return Response.json({ error: "관리자 암호가 올바르지 않습니다." }, { status: 401 });
  }
  clearLoginFails(key);
  await createAdminSession();
  return Response.json({ authenticated: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  await clearAdminSession();
  return Response.json({ authenticated: false });
}
