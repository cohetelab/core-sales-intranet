import type { DealStage } from "./types";

// 파이프라인 단계를 시트의 '단계' 칸에 적는 글자. 리드는 칸을 비운다.
// 앱의 단계 → 시트 '단계' 칸에 쓰는 글자. 시트 칸이 드롭다운(리드·연락됨·딜 (제안중)·제안서 전달·견적서 전달·계약서 전달·성사·실패/종료·부재중)이라
// 이 목록에 있는 값만 쓸 수 있다. 읽는 규칙은 lead-sheet.ts 의 stageFromSheet.
export const STAGE_SHEET_VALUE: Record<DealStage, string> = { lead: "리드", discovery: "연락됨", proposal: "딜 (제안중)", won: "성사" };

// 고객 태그("계약금액 ₩2,090,000")에서 계약 금액 숫자를 읽는다. 없으면 0.
export function contractAmountOf(tags: string[]) {
  const tag = tags.find((t) => t.startsWith("계약금액 "));
  const n = Number((tag ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 시트의 "영업이 수기로 적는 칸" 중 인트라넷에서 기록하는 것들의 공용 규칙(서버·화면이 같이 쓴다).
// 서버는 이 규칙으로 입력을 다시 검증하고, 화면은 같은 규칙으로 시트가 쓰는 표기(예: "2026. 3. 12.")로 바꿔 보낸다.

export const FIELD_KEYS = ["consult", "nextAction", "probability", "lastContact", "retouch", "memo", "contract"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

// 시트의 칸 이름(Apps Script가 공백을 무시하고 맞춘다)
export const FIELD_COLUMN: Record<FieldKey, string> = {
  consult: "1차 상담 내용",
  nextAction: "다음 액션 플랜",
  probability: "가능성",
  lastContact: "최근 연락일",
  retouch: "리터치 일정",
  memo: "메모",
  contract: "계약 금액",
};

export const FIELD_LABEL: Record<FieldKey, string> = {
  consult: "상담 내용",
  nextAction: "다음 액션",
  probability: "가능성",
  lastContact: "최근 연락일",
  retouch: "리터치 일정",
  memo: "메모",
  contract: "계약 금액",
};

// 상담 내용 칸의 한도. 배포된 시트 스크립트(Code.gs의 MAX_VALUE_LENGTH)가 한 칸에 5000자까지만 쓰게 막으므로 같은 값을 쓴다.
export const CONSULT_LIMIT = 5000;
const LIMIT: Record<FieldKey, number> = { consult: CONSULT_LIMIT, nextAction: 200, probability: 5, lastContact: 20, retouch: 20, memo: 1000, contract: 24 };

const ERROR_CELL = /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/i;

// 시트 칸의 원문 → 화면에 보일 값(수식 오류·"-"는 빈 값)
export function cleanCell(raw: string | undefined) {
  const v = (raw ?? "").trim();
  return !v || v === "-" || ERROR_CELL.test(v) ? "" : v;
}

const pad = (n: number | string) => String(n).padStart(2, "0");

// "2026. 3. 12." · "2026.3.12" · "2026-03-12" · "3/5/2026" → "2026-03-12" (날짜 입력칸용). 못 읽으면 "".
export function fromSheetDate(raw: string | undefined) {
  const s = cleanCell(raw);
  let m = s.match(/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : "";
}

// "2026-03-12" → 시트가 쓰는 표기 "2026. 3. 12."
export function toSheetDate(input: string) {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : "";
}

const kstNow = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000);
export const todayKst = (now = Date.now()) => kstNow(now).toISOString().slice(0, 10);

// 상담 기록 한 줄: [11.06 14:30 Ian] 내용
export function noteLine(user: string, text: string, now = Date.now()) {
  const k = kstNow(now).toISOString();
  const who = user.match(/\(([^)]+)\)/)?.[1] ?? user;
  return `[${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)} ${who}] ${text.trim()}`;
}

// 유형(전화·이메일·미팅·메모)이 붙은 기록 줄: [11.06 14:30 Ian] (전화) 내용
export const typedNoteLine = (user: string, text: string, type: string | null, now = Date.now()) =>
  noteLine(user, type ? `(${type}) ${text.trim()}` : text, now);

// 단계를 옮길 때 히스토리에 자동으로 남기는 줄: [11.20 16:30 Ian] (단계) 연락됨 → 딜 (제안중). 빈 단계는 리드로 적는다.
export const stageChangeLine = (user: string, from: string, to: string, now = Date.now()) =>
  typedNoteLine(user, `${from.trim() || "리드"} → ${to.trim() || "리드"}`, "단계", now);

export const formatContract = (amount: number) => `₩${Math.round(amount).toLocaleString("en-US")}`;

// 표기가 달라도(예: "2026. 3. 12." 와 "2026-03-12") 같은 값이면 true. 시트에서 실제로 바뀌었는지 판단할 때 쓴다.
export function sameCell(key: FieldKey, a?: string, b?: string) {
  const x = cleanCell(a);
  const y = cleanCell(b);
  if (key === "lastContact" || key === "retouch") return fromSheetDate(x) === fromSheetDate(y);
  if (key === "probability" || key === "contract") return x.replace(/\D/g, "") === y.replace(/\D/g, "");
  return x.replace(/\r/g, "") === y.replace(/\r/g, "");
}

export type FieldCheck = { ok: true; value: string } | { ok: false; error: string };

// 시트에 쓸 최종 값을 검사한다. 빈 문자열은 "칸 비우기"로 허용한다.
export function checkField(key: FieldKey, input: unknown): FieldCheck {
  if (typeof input !== "string") return { ok: false, error: "bad_value" };
  const value = input.replace(/\r\n/g, "\n").trim();
  if (value.length > LIMIT[key]) return { ok: false, error: "too_long" };
  if (value === "") return { ok: true, value };
  if (key === "probability") {
    const n = value.match(/^(\d{1,3})%$/);
    return n && Number(n[1]) <= 100 ? { ok: true, value } : { ok: false, error: "bad_probability" };
  }
  if (key === "lastContact" || key === "retouch") {
    // 형식뿐 아니라 달력에 있는 날짜인지도 본다(2026. 13. 40. · 2026. 2. 30. 거절)
    const m = value.match(/^(\d{4})\. (\d{1,2})\. (\d{1,2})\.$/);
    if (!m) return { ok: false, error: "bad_date" };
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
    return real ? { ok: true, value } : { ok: false, error: "bad_date" };
  }
  if (key === "contract") return /^₩\d{1,3}(,\d{3})*$/.test(value) ? { ok: true, value } : { ok: false, error: "bad_amount" };
  if (key === "nextAction") return /\n/.test(value) ? { ok: false, error: "bad_value" } : { ok: true, value };
  return { ok: true, value };
}
