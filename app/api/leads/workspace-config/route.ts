import { NextResponse } from "next/server";

import { leadsConfigured, sameOrigin, sessionIsAdmin, sessionUser } from "@/lib/leads-auth";
import { StoreError, backendKind, readDoc, writeDoc } from "@/lib/workspace-config-server";
import { defaultConfig, isOwnTargetChange, normalizeConfig, type TeamDoc } from "@/lib/workspace-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 팀 공용 화면 설정(로그인 쿠키가 /api/leads 아래로만 전달되므로 주소도 그 아래에 둔다). 로그인한 사람만 읽고 쓴다. 쓸 때는 읽어 온 version(baseVersion)을 함께 보내고,
// 그 사이 다른 사람이 먼저 저장했으면 덮어쓰지 않고 409와 최신 문서를 돌려준다(화면이 자기 변경을 최신 위에 다시 적용한다).
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const me = sessionUser(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  const admin = sessionIsAdmin(req);
  const backend = backendKind();
  if (backend === "none") return NextResponse.json({ backend, doc: null, admin, user: me }, { headers: NO_STORE });
  try {
    return NextResponse.json({ backend, doc: await readDoc(), admin, user: me }, { headers: NO_STORE });
  } catch (e) {
    console.error("workspace-config: read failed", e instanceof StoreError ? e.message : "unknown");
    return NextResponse.json({ error: "store_error", backend }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });
  if (backendKind() === "none") return NextResponse.json({ error: "no_backend" }, { status: 503 });

  let baseVersion = 0;
  let config: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = JSON.parse(raw) as { config?: { version?: unknown }; baseVersion?: unknown };
    if (!body.config || body.config.version !== 1) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    config = body.config;
    baseVersion = typeof body.baseVersion === "number" && Number.isFinite(body.baseVersion) ? Math.floor(body.baseVersion) : 0;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const current = await readDoc();
    if (current && baseVersion !== current.version) return NextResponse.json({ error: "conflict", doc: current }, { status: 409, headers: NO_STORE });
    // 관리자가 아니면 본인 월 목표만 바꿀 수 있다(홈 카드·메뉴·기준일·다른 사람의 목표는 관리자만).
    const next = normalizeConfig(config);
    if (!sessionIsAdmin(req) && !isOwnTargetChange(current?.config ?? defaultConfig(), next, user)) {
      return NextResponse.json({ error: "admin_only", doc: current }, { status: 403, headers: NO_STORE });
    }
    const doc: TeamDoc = { version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: user, config: next };
    await writeDoc(doc);
    return NextResponse.json({ doc }, { headers: NO_STORE });
  } catch (e) {
    console.error("workspace-config: write failed", e instanceof StoreError ? e.message : "unknown");
    return NextResponse.json({ error: "store_error" }, { status: 502 });
  }
}
