import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, driveConfigured, DRIVE_SCOPE, STATE_COOKIE } from "@/lib/google-drive";

export async function GET(request: Request) {
  if (!driveConfigured()) return NextResponse.redirect(new URL("/customers/drive?error=setup", request.url));
  const state = randomBytes(24).toString("base64url");
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_DRIVE_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", process.env.GOOGLE_DRIVE_REDIRECT_URI!);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", `openid email ${DRIVE_SCOPE}`);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("state", state);
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  return NextResponse.redirect(auth);
}
