import { NextResponse } from "next/server";

import { MAX_COMPANY, MAX_NOTE, buildRequest, cleanWebsite, parseResponse } from "@/lib/company-research";
import { FAIL_LIMIT, clientIp, recentFails, sameSecret } from "@/lib/room-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 고객사 AI 조사 서버 라우트(DeepSeek 웹 검색 + 링크 읽기).
// 이 인트라넷에는 로그인이 없어서 주소가 열려 있으면 누구나 API 비용(토큰 + 검색 호출료)을 쓸 수 있다.
// 그래서 agent-room과 같은 방식으로 (1) 서버 환경변수 ROOM_PASSCODE를 요청 헤더로 맞춰야 하고(미설정이면 닫힘),
// (2) IP별·일일 호출 상한을 두고, (3) 입력 크기를 제한한다. 키는 서버 환경변수(DEEPSEEK_API_KEY)에서만 읽는다.
// 결과는 초안으로만 돌려주고, 고객사 기록은 이 라우트가 수정하지 않는다.

const API_URL = "https://api.deepseek.com/anthropic/v1/messages";
const MAX_BODY_BYTES = 4_000;
const WINDOW_MS = 10 * 60_000;
const PER_IP_LIMIT = 10; // 10분당 호출
const DAILY_CAP = Math.max(1, Number(process.env.RESEARCH_DAILY_CAP) || 50); // 검색은 호출당 과금이라 낮게 둔다

// 서버리스 인스턴스 메모리 기준의 최선 노력(best-effort) 제한이다.
const hits = new Map<string, number[]>();
let day = { key: "", count: 0 };

const configured = () => Boolean(process.env.DEEPSEEK_API_KEY && process.env.ROOM_PASSCODE);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  // 키·비밀번호 값은 내보내지 않고 설정 여부만 알려 준다.
  return NextResponse.json({ configured: configured() });
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const now = Date.now();
  const ip = clientIp(req);
  if (recentFails(ip, now).length >= FAIL_LIMIT) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  if (!sameSecret(req.headers.get("x-room-passcode") ?? "", process.env.ROOM_PASSCODE as string)) {
    recentFails(ip, now).push(now);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date(now).toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  const ipHits = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.set(ip, ipHits);
  if (ipHits.length >= PER_IP_LIMIT || day.count >= DAILY_CAP) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { company?: unknown; website?: unknown; note?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const company = str(body.company, MAX_COMPANY);
  if (!company) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const input = { company, website: cleanWebsite(body.website), note: str(body.note, MAX_NOTE) };

  day.count += 1;
  ipHits.push(now);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.DEEPSEEK_API_KEY as string },
      body: JSON.stringify(buildRequest(input)),
      signal: AbortSignal.timeout(55_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      // 응답 본문(키·내부 문구가 섞일 수 있음)은 내보내지 않고 상태 분류만 알려 준다.
      console.error("company-research: api status", response.status);
      if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "ai_auth" }, { status: 502 });
      if (response.status === 402) return NextResponse.json({ error: "ai_quota" }, { status: 502 });
      if (response.status === 429) return NextResponse.json({ error: "ai_rate_limited" }, { status: 429 });
      return NextResponse.json({ error: "ai_error" }, { status: 502 });
    }
    const result = parseResponse(raw);
    if (!result.ok) {
      if (result.reason === "refused") return NextResponse.json({ refused: true });
      console.error("company-research: parse", result.reason);
      return NextResponse.json({ error: result.reason === "empty" ? "ai_empty" : "ai_error" }, { status: 502 });
    }
    const { ok: _ok, ...data } = result;
    void _ok;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "ai_timeout" }, { status: 504 });
    }
    console.error("company-research: unexpected", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "ai_unreachable" }, { status: 502 });
  }
}
