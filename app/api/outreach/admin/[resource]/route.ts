import { isAdmin, isUuid, json, notConfigured, pick, readJson, unauthorized } from "@/lib/outreach-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLES = {
  accounts: { table: "outreach_accounts", select: "*", insert: ["label", "handle", "daily_cap", "min_interval_sec", "active"] },
  targets: {
    table: "outreach_targets",
    select: "*",
    insert: ["platform", "handle", "display_name", "profile_url", "followers", "category", "source", "notes"],
  },
  messages: {
    table: "outreach_messages",
    select: "*, target:outreach_targets(handle, display_name), account:outreach_accounts(label)",
    insert: ["target_id", "account_id", "body"],
  },
  replies: {
    table: "outreach_replies",
    select: "*, target:outreach_targets(handle, display_name), account:outreach_accounts(label)",
    insert: [] as string[],
  },
} as const;

type Resource = keyof typeof TABLES;
const isResource = (v: string): v is Resource => v in TABLES;

export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  if (!isAdmin(req)) return unauthorized();
  const { resource } = await params;
  if (!isResource(resource)) return json({ error: "not found" }, 404);
  const db = supabaseAdmin();
  if (!db) return notConfigured();

  const cfg = TABLES[resource];
  const status = new URL(req.url).searchParams.get("status");
  // 답장 테이블에는 created_at이 없고 received_at만 있다.
  const orderCol = resource === "replies" ? "received_at" : "created_at";
  let q = db.from(cfg.table).select(cfg.select).order(orderCol, { ascending: false }).limit(300);
  if (status && resource !== "accounts" && resource !== "replies") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ data });
}

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  if (!isAdmin(req)) return unauthorized();
  const { resource } = await params;
  if (!isResource(resource) || TABLES[resource].insert.length === 0) return json({ error: "not found" }, 404);
  const db = supabaseAdmin();
  if (!db) return notConfigured();

  const body = await readJson(req);
  if (!body) return json({ error: "invalid json" }, 400);
  const cfg = TABLES[resource];
  const row = pick(body, [...cfg.insert]);

  if (resource === "targets") {
    if (typeof row.handle !== "string" || !row.handle.trim()) return json({ error: "handle 필요" }, 400);
    row.handle = row.handle.trim().replace(/^@/, "").toLowerCase();
  }
  if (resource === "messages") {
    if (!isUuid(row.target_id) || !isUuid(row.account_id)) return json({ error: "target_id/account_id 필요" }, 400);
    if (typeof row.body !== "string" || !row.body.trim() || row.body.length > 2000) {
      return json({ error: "body는 1~2000자" }, 400);
    }
  }
  if (resource === "accounts" && (typeof row.label !== "string" || !row.label.trim())) {
    return json({ error: "label 필요" }, 400);
  }

  const { data, error } = await db.from(cfg.table).insert(row).select().single();
  if (error) return json({ error: error.message }, error.code === "23505" ? 409 : 500);
  return json({ data }, 201);
}
