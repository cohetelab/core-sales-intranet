import { NextResponse } from "next/server";

import { FIELD_KEYS, checkField, type FieldKey } from "@/lib/lead-fields";
import { leadsConfigured, sameOrigin, sessionUser } from "@/lib/leads-auth";
import { SheetError, writeFields } from "@/lib/sheet-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^lead-[a-z0-9]{1,40}$/;

// 상담 기록: 고객의 가장 최근 문의 행의 수기 칸(상담 내용·다음 액션·가능성·최근 연락일·리터치 일정·메모·계약 금액)에 쓴다.
// base는 사용자가 폼을 열었을 때 보던 칸의 원문이다. 그 사이 시트에서 바뀌었으면 덮어쓰지 않고 conflict로 알려 준다.
export async function POST(req: Request) {
  if (!leadsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = sessionUser(req);
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  let body: { id?: unknown; changes?: unknown; base?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 60_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !ID.test(body.id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // 서버가 값을 다시 검사한다(화면 검사를 믿지 않는다). 알 수 없는 칸이 섞여 있으면 거절한다.
  const input = body.changes as Record<string, unknown>;
  const changes: Partial<Record<FieldKey, string>> = {};
  for (const key of Object.keys(input)) {
    if (!(FIELD_KEYS as readonly string[]).includes(key)) return NextResponse.json({ error: "bad_field", field: key }, { status: 400 });
    const checked = checkField(key as FieldKey, input[key]);
    if (!checked.ok) return NextResponse.json({ error: "bad_field", field: key, reason: checked.error }, { status: 400 });
    changes[key as FieldKey] = checked.value;
  }
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let base: Partial<Record<FieldKey, string>> | null = null;
  if (body.base && typeof body.base === "object" && !Array.isArray(body.base)) {
    base = {};
    for (const [k, v] of Object.entries(body.base as Record<string, unknown>)) {
      if ((FIELD_KEYS as readonly string[]).includes(k) && typeof v === "string" && v.length <= 6000) base[k as FieldKey] = v;
    }
  }

  try {
    return NextResponse.json({ results: await writeFields(body.id, changes, base, user) });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "server_error";
    console.error("leads: record failed", code);
    return NextResponse.json({ error: "sheet_error", code }, { status: 502 });
  }
}
