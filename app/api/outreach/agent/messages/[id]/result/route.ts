import { isAgent, isUuid, json, notConfigured, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// 발송 결과 보고. sending 상태인 건만 sent/failed로 바꿀 수 있다.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgent(req)) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "invalid id" }, 400);
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = await readJson(req);
  if (!body || (body.status !== "sent" && body.status !== "failed")) {
    return json({ error: "status는 sent | failed" }, 400);
  }

  const patch =
    body.status === "sent"
      ? { status: "sent", sent_at: new Date().toISOString(), error: null }
      : { status: "failed", error: String(body.error ?? "").slice(0, 500) || "unknown" };
  const { data, error } = await db
    .from("outreach_messages")
    .update(patch)
    .eq("id", id)
    .eq("status", "sending")
    .select()
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "sending 상태의 메시지가 아닙니다." }, 409);

  if (body.status === "sent") {
    await db.from("outreach_targets").update({ status: "contacted" }).eq("id", data.target_id);
  }
  return json({ data });
}
