import { knowledgeServerClient } from "@/lib/knowledge-auth";

export const dynamic = "force-dynamic";

async function authorized() {
  const db = await knowledgeServerClient();
  if (!db) return { error: Response.json({ error: "지식창고 환경변수가 설정되지 않았습니다." }, { status: 503 }) };
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const membership = await db.from("knowledge_members").select("active").eq("user_id", auth.user.id).maybeSingle();
  if (membership.error) return { error: Response.json({ error: "지식창고 테이블을 확인할 수 없습니다. 관리자에게 설정을 요청하세요." }, { status: 503 }) };
  if (!membership.data?.active) return { error: Response.json({ error: "초대된 직원 계정만 접근할 수 있습니다." }, { status: 403 }) };
  return { db, user: auth.user };
}

export async function GET() {
  const ctx = await authorized();
  if (ctx.error) return ctx.error;
  const db = ctx.db!;
  const [folders, documents] = await Promise.all([
    db.from("knowledge_folders").select("id,parent_id,name,created_at,deleted_at").order("name"),
    db.from("knowledge_documents").select("id,folder_id,title,body,body_text,version,created_by,updated_by,created_at,updated_at,deleted_at").order("updated_at", { ascending: false }),
  ]);
  if (folders.error || documents.error) return Response.json({ error: "문서 목록을 불러오지 못했습니다." }, { status: 500 });
  return Response.json({ folders: folders.data, documents: documents.data, email: ctx.user!.email }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ctx = await authorized();
  if (ctx.error) return ctx.error;
  const db = ctx.db!;
  const userId = ctx.user!.id;
  const input = await request.json().catch(() => null);
  if (!input || typeof input.op !== "string") return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const id = typeof input.id === "string" ? input.id : "";
  const folderId = typeof input.folderId === "string" ? input.folderId : null;
  if (input.op === "createFolder") {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 120) return Response.json({ error: "폴더 이름을 확인하세요." }, { status: 400 });
    if (folderId) {
      const parent = await db.from("knowledge_folders").select("id").eq("id", folderId).is("deleted_at", null).maybeSingle();
      if (!parent.data) return Response.json({ error: "상위 폴더를 찾을 수 없습니다." }, { status: 400 });
    }
    const result = await db.from("knowledge_folders").insert({ name, parent_id: folderId, created_by: userId }).select().single();
    return result.error ? Response.json({ error: result.error.message }, { status: 400 }) : Response.json({ item: result.data });
  }
  if (input.op === "createDocument") {
    if (folderId) {
      const folder = await db.from("knowledge_folders").select("id").eq("id", folderId).is("deleted_at", null).maybeSingle();
      if (!folder.data) return Response.json({ error: "폴더를 찾을 수 없습니다." }, { status: 400 });
    }
    const result = await db.from("knowledge_documents").insert({ folder_id: folderId, title: "제목 없음", created_by: userId, updated_by: userId }).select().single();
    return result.error ? Response.json({ error: result.error.message }, { status: 400 }) : Response.json({ item: result.data });
  }
  if (!id) return Response.json({ error: "항목 ID가 필요합니다." }, { status: 400 });
  if (input.op === "saveDocument") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 200 || typeof input.bodyText !== "string" || input.bodyText.length > 200000 || !input.body || typeof input.body !== "object" || JSON.stringify(input.body).length > 500000 || !Number.isInteger(input.version)) {
      return Response.json({ error: "문서 내용을 확인하세요." }, { status: 400 });
    }
    const result = await db.rpc("save_knowledge_document", { p_id: id, p_expected_version: input.version, p_title: title, p_body: input.body, p_body_text: input.bodyText });
    if (result.error) return Response.json({ error: result.error.message }, { status: 400 });
    if (!result.data) return Response.json({ error: "다른 직원이 먼저 저장했습니다. 내 내용을 복사한 뒤 최신 문서를 다시 열어주세요." }, { status: 409 });
    return Response.json({ item: result.data });
  }
  if (input.op === "moveDocument") {
    const result = await db.from("knowledge_documents").update({ folder_id: folderId, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select().maybeSingle();
    return result.error ? Response.json({ error: result.error.message }, { status: 400 }) : Response.json({ item: result.data });
  }
  if (input.op === "trashDocument" || input.op === "restoreDocument") {
    const result = await db.from("knowledge_documents").update({ deleted_at: input.op === "trashDocument" ? new Date().toISOString() : null, updated_by: userId }).eq("id", id).select().maybeSingle();
    return result.error ? Response.json({ error: result.error.message }, { status: 400 }) : Response.json({ item: result.data });
  }
  if (input.op === "trashFolder" || input.op === "restoreFolder") {
    const result = await db.from("knowledge_folders").update({ deleted_at: input.op === "trashFolder" ? new Date().toISOString() : null }).eq("id", id).select().maybeSingle();
    return result.error ? Response.json({ error: result.error.message }, { status: 400 }) : Response.json({ item: result.data });
  }
  return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
}
