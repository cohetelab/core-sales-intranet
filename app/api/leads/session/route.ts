import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  adminNames,
  adminPasscodeOk,
  adminProtected,
  isAdminName,
  sessionIsAdmin,
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
    // admin: 이 로그인이 관리자인지 · admins: 관리자 이름 · adminProtected: 관리자 비밀번호가 설정돼 있는지(없으면 이름만 고르면 관리자가 된다)
    { configured, user: configured ? sessionUser(req) : null, reps: SALES_REPS, admin: configured ? sessionIsAdmin(req) : false, admins: adminNames(), adminProtected: adminProtected() },
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
  // 관리자 이름은 관리자 비밀번호가 설정돼 있으면 그 비밀번호로만 들어간다(공용 비밀번호는 거절). 그래야 이름만 골라서 관리자가 되는 일이 없다.
  const asAdmin = isAdminName(name) && adminProtected();
  const passOk = typeof body.passcode === "string" && (asAdmin ? adminPasscodeOk(body.passcode) : passcodeOk(body.passcode));
  if (!passOk) {
    recordLoginFail(ip);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  clearLoginFails(ip);
  const res = NextResponse.json({ ok: true, user: name, admin: isAdminName(name) });
  res.cookies.set(SESSION_COOKIE, newSession(name, Date.now(), asAdmin), { ...cookieBase, maxAge: SESSION_SECONDS });
  return res;
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
