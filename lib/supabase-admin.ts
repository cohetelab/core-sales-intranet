import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// secret 키는 RLS를 우회하므로 서버(API 라우트)에서만 쓴다. 브라우저 번들에 들어가면 안 된다.
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
