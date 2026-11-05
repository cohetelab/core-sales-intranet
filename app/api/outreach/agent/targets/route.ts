import { isAgent, json, notConfigured, pick, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// 탐색 결과를 후보로 일괄 등록한다. 이미 있는 (platform, handle)은 건드리지 않는다.
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = await readJson(req);
  const list = body && Array.isArray(body.targets) ? body.targets : null;
  if (!list || list.length === 0 || list.length > 200) return json({ error: "targets는 1~200개 배열" }, 400);

  const rows = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.handle !== "string" || !item.handle.trim()) continue;
    const row = pick(item as Record<string, unknown>, [
      "display_name",
      "profile_url",
      "followers",
      "category",
      "source",
      "notes",
    ]);
    rows.push({ ...row, platform: "instagram", handle: item.handle.trim().replace(/^@/, "").toLowerCase() });
  }
  if (rows.length === 0) return json({ error: "유효한 handle이 없습니다." }, 400);

  const { data, error } = await db
    .from("outreach_targets")
    .upsert(rows, { onConflict: "platform,handle", ignoreDuplicates: true })
    .select("id");
  if (error) return json({ error: error.message }, 500);
  return json({ inserted: data?.length ?? 0, received: rows.length }, 201);
}
