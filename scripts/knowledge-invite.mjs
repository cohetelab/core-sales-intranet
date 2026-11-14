import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node --env-file=.env.local scripts/knowledge-invite.mjs employee@example.com");
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: process.env.KNOWLEDGE_INVITE_REDIRECT_URL || "https://core-sales-intranet.vercel.app/knowledge",
});
if (error) throw error;
if (!data.user) throw new Error("Supabase did not return an invited user");
const membership = await admin.from("knowledge_members").upsert({ user_id: data.user.id, email, active: true });
if (membership.error) throw membership.error;
console.log(`Invited ${email} and granted knowledge workspace access.`);
