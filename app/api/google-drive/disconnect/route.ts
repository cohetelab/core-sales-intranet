import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const db = supabaseAdmin();
    if (!db) return NextResponse.json({ error: "storage" }, { status: 503 });
    const { error } = await db.from("google_drive_sessions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "storage" }, { status: 502 });
  }
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
