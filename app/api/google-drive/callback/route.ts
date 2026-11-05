import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, driveConfigured, encryptToken, DRIVE_SCOPE, SESSION_AGE, SESSION_COOKIE, STATE_COOKIE } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";

function back(request: Request, error?: string) {
  const target = new URL("/customers/drive", request.url);
  if (error) target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const jar = await cookies();
  const url = new URL(request.url);
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete(STATE_COOKIE);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!driveConfigured() || !expected || !state || !code || expected.length !== state.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return back(request, "oauth");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) return back(request, "oauth");
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; scope?: string };
  if (!tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes(DRIVE_SCOPE)) return back(request, "scope");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store",
  });
  if (!profileResponse.ok) return back(request, "oauth");
  const profile = await profileResponse.json() as { email?: string; email_verified?: boolean };
  if (!profile.email || !profile.email_verified) return back(request, "oauth");

  const db = supabaseAdmin()!;
  const oldSession = jar.get(SESSION_COOKIE)?.value;
  if (oldSession && /^[0-9a-f-]{36}$/i.test(oldSession)) await db.from("google_drive_sessions").delete().eq("id", oldSession);
  const id = randomUUID();
  const { error } = await db.from("google_drive_sessions").insert({
    id,
    email: profile.email,
    refresh_token_ciphertext: encryptToken(tokens.refresh_token),
    expires_at: new Date(Date.now() + SESSION_AGE * 1000).toISOString(),
  });
  if (error) return back(request, "storage");
  jar.set(SESSION_COOKIE, id, cookieOptions(SESSION_AGE));
  return back(request);
}
