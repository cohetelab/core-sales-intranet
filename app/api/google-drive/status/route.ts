import { NextResponse } from "next/server";
import { driveConfigured, driveSession } from "@/lib/google-drive";

export async function GET() {
  if (!driveConfigured()) return NextResponse.json({ configured: false, connected: false }, { headers: { "Cache-Control": "no-store" } });
  const session = await driveSession();
  return NextResponse.json({ configured: true, connected: Boolean(session), email: session?.email ?? null }, { headers: { "Cache-Control": "no-store" } });
}
