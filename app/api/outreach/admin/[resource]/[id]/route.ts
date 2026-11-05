import { isAdmin, isUuid, json, notConfigured, pick, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TARGET_STATUSES = ["candidate", "approved", "excluded", "contacted", "replied", "closed"];

export async function PATCH(req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  if (!isAdmin(req)) return unauthorized();
  const { resource, id } = await params;
  if (!isUuid(id)) return json({ error: "invalid id" }, 400);
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = await readJson(req);
  if (!body) return json({ error: "invalid json" }, 400);

  if (resource === "accounts") {
    const patch = pick(body, ["label", "handle", "daily_cap", "min_interval_sec", "active"]);
    const { data, error } = await db.from("outreach_accounts").update(patch).eq("id", id).select().single();
    return error ? json({ error: error.message }, 500) : json({ data });
  }

  if (resource === "targets") {
    const patch = pick(body, ["status", "notes", "category", "display_name"]);
    if (patch.status !== undefined && !TARGET_STATUSES.includes(String(patch.status))) {
      return json({ error: "invalid status" }, 400);
    }
    const { data, error } = await db.from("outreach_targets").update(patch).eq("id", id).select().single();
    return error ? json({ error: error.message }, 500) : json({ data });
  }

  if (resource === "replies") {
    const { data, error } = await db
      .from("outreach_replies")
      .update({ handled: body.handled === true })
      .eq("id", id)
      .select()
      .single();
    return error ? json({ error: error.message }, 500) : json({ data });
  }

  if (resource === "messages") {
    const action = body.action;
    if (action === "edit") {
      if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 2000) {
        return json({ error: "body는 1~2000자" }, 400);
      }
      const { data, error } = await db
        .from("outreach_messages")
        .update({ body: body.body })
        .eq("id", id)
        .eq("status", "draft")
        .select()
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return data ? json({ data }) : json({ error: "초안 상태에서만 수정할 수 있습니다." }, 409);
    }
    if (action === "approve") {
      // 승인은 초안에서만. 같은 대상에 이미 활성 메시지가 있으면 유니크 인덱스가 막는다(409).
      const { data, error } = await db
        .from("outreach_messages")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "draft")
        .select()
        .maybeSingle();
      if (error) return json({ error: error.message }, error.code === "23505" ? 409 : 500);
      if (!data) return json({ error: "초안 상태에서만 승인할 수 있습니다." }, 409);
      await db.from("outreach_targets").update({ status: "approved" }).eq("id", data.target_id).eq("status", "candidate");
      return json({ data });
    }
    if (action === "cancel") {
      const { data, error } = await db
        .from("outreach_messages")
        .update({ status: "cancelled" })
        .eq("id", id)
        .in("status", ["draft", "approved"])
        .select()
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return data ? json({ data }) : json({ error: "이미 발송 중이거나 끝난 건은 취소할 수 없습니다." }, 409);
    }
    return json({ error: "action은 edit | approve | cancel" }, 400);
  }

  return json({ error: "not found" }, 404);
}
