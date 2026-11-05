import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_PATH,
  SESSION_SECONDS,
  clearLoginFails,
  clientIp,
  leadsConfigured,
  loginBlocked,
  newSession,
  passcodeOk,
  recordLoginFail,
  sameOrigin,
  sessionUser,
} from "@/lib/leads-auth";
import { SALES_REPS } from "@/lib/sales-reps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieBase = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: SESSION_PATH,
};

// 설정 여부와 로그인 상태만 알려 준다(비밀번호·토큰 값은 내보내지 않는다).
export async function GET(req: Request) {
  const configured = leadsConfigured();
  return NextResponse.json(
    { configured, user: configured ? sessionUser(req) : null, reps: SALES_REPS },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ip = clientIp(req);
  if (loginBlocked(ip)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  let body: { passcode?: unknown; name?: unknown } = {};
  try {
    const raw = await req.text();
    if (raw.length > 1000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!(SALES_REPS as readonly string[]).includes(name)) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  if (typeof body.passcode !== "string" || !passcodeOk(body.passcode)) {
    recordLoginFail(ip);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  clearLoginFails(ip);
  const res = NextResponse.json({ ok: true, user: name });
  res.cookies.set(SESSION_COOKIE, newSession(name), { ...cookieBase, maxAge: SESSION_SECONDS });
  return res;
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
