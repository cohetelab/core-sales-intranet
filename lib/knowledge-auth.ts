import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function knowledgeConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export async function knowledgeServerClient() {
  const config = knowledgeConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server components cannot write cookies. Route handlers can.
        }
      },
    },
  });
}
