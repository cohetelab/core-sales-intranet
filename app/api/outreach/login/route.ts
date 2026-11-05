import { SESSION_COOKIE, SESSION_SECONDS, json, newSession, passwordOk, readJson } from "@/lib/outreach-auth";

// 틀린 비밀번호를 연달아 넣는 걸 늦춘다. 서버리스 인스턴스마다 따로 세므로 완전한 방어는 아니고,
// 공개 배포에서는 길고 추측하기 어려운 비밀번호를 같이 써야 한다.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: Request) {
  const token = newSession();
  if (!token) return json({ error: "OUTREACH_ADMIN_PASSWORD가 설정되지 않았습니다." }, 503);

  const key = clientKey(req);
  const now = Date.now();
  const entry = fails.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILS) {
    return json({ error: "시도 횟수를 넘었습니다. 15분 뒤에 다시 해 주세요." }, 429);
  }

  const body = await readJson(req);
  if (!body || typeof body.password !== "string" || !passwordOk(body.password)) {
    const cur = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    cur.count += 1;
    fails.set(key, cur);
    return json({ error: "비밀번호가 맞지 않습니다." }, 401);
  }
  fails.delete(key);
  const res = json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
  return res;
}

export async function DELETE() {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
