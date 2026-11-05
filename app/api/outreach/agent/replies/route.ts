import { isAgent, isUuid, json, notConfigured, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Aside가 DM함에서 읽은 답장을 올린다. 우리가 등록한 대상의 답장만 받는다.
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = await readJson(req);
  if (!body || !isUuid(body.account_id) || typeof body.target_handle !== "string" || typeof body.body !== "string") {
    return json({ error: "account_id, target_handle, body 필요" }, 400);
  }
  const text = body.body.trim().slice(0, 4000);
  if (!text) return json({ error: "body가 비어 있습니다." }, 400);
  const handle = body.target_handle.trim().replace(/^@/, "").toLowerCase();

  const { data: target } = await db
    .from("outreach_targets")
    .select("id")
    .eq("platform", "instagram")
    .eq("handle", handle)
    .maybeSingle();
  if (!target) return json({ error: "알 수 없는 대상입니다." }, 404);

  const { data: msg } = await db
    .from("outreach_messages")
    .select("id")
    .eq("target_id", target.id)
    .eq("account_id", body.account_id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 같은 내용을 두 번 올려도 중복으로 쌓이지 않게 한다.
  const { data: dup } = await db
    .from("outreach_replies")
    .select("id")
    .eq("target_id", target.id)
    .eq("account_id", body.account_id)
    .eq("body", text)
    .limit(1)
    .maybeSingle();
  if (dup) return json({ data: dup, duplicate: true });

  const received_at =
    typeof body.received_at === "string" && !Number.isNaN(Date.parse(body.received_at))
      ? new Date(body.received_at).toISOString()
      : new Date().toISOString();
  const { data, error } = await db
    .from("outreach_replies")
    .insert({ target_id: target.id, account_id: body.account_id, message_id: msg?.id ?? null, body: text, received_at })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  await db.from("outreach_targets").update({ status: "replied" }).eq("id", target.id).eq("status", "contacted");
  return json({ data }, 201);
}
