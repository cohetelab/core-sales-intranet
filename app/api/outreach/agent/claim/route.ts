import { isAgent, isUuid, json, notConfigured, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Aside가 "다음에 보낼 DM"을 받아 간다. 하루 상한·간격은 DB 함수가 강제한다.
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = await readJson(req);
  if (!body || !isUuid(body.account_id)) return json({ error: "account_id 필요" }, 400);

  const { data, error } = await db.rpc("claim_next_outreach_message", { p_account: body.account_id });
  if (error) return json({ error: error.message }, 500);
  const msg = Array.isArray(data) ? data[0] : data;
  if (!msg) return json({ data: null });

  const { data: target } = await db
    .from("outreach_targets")
    .select("handle, display_name, profile_url")
    .eq("id", msg.target_id)
    .single();
  return json({ data: { message_id: msg.id, body: msg.body, target } });
}
