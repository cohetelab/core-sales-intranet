import { contractAmountOf } from "./lead-fields";
import { UNASSIGNED } from "./sales-reps";
import type { Customer } from "./types";

// 오늘의 점검: 시트 데이터만 보고 계산하는 규칙이다(AI를 쓰지 않는다). 읽기만 하고 아무것도 바꾸지 않는다.
// 기준 시각(now)과 오늘 날짜(today, 한국 기준 YYYY-MM-DD)를 밖에서 받아서 같은 입력이면 항상 같은 결과가 나온다.

export type CheckId = "unassigned" | "noContact" | "overdue" | "stale" | "noAmount";

export const DAY_MS = 86_400_000;
export const FIRST_CONTACT_HOURS = 24;
export const STALE_DAYS = 14;
const FAILED_TAG = "실패/종료";

export const CHECKS: { id: CheckId; label: string; hint: string; tone: "danger" | "warning" | "neutral" }[] = [
  { id: "unassigned", label: "24시간 넘게 미배정", hint: "들어온 지 24시간이 지났는데 담당자가 없는 리드", tone: "danger" },
  { id: "noContact", label: "첫 컨택 기록 없음", hint: "담당은 있는데 24시간이 지나도록 상담 내용·다음 액션 기록이 없는 리드", tone: "danger" },
  { id: "overdue", label: "리터치 일정 지남", hint: "리터치 일정 날짜가 지났고 아직 계약 전인 고객", tone: "warning" },
  { id: "stale", label: "14일 넘게 활동 없음", hint: "상담·제안 단계에서 14일 넘게 움직임이 없는 고객", tone: "warning" },
  { id: "noAmount", label: "계약 금액 미기재", hint: "계약 단계인데 계약 금액이 비어 있는 고객", tone: "neutral" },
];

const failed = (c: Customer) => c.tags.includes(FAILED_TAG);
const ageMs = (iso: string, now: number) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : now - t;
};

// 리터치 일정(ISO)을 한국 날짜 "YYYY-MM-DD"로
export const dueDayOf = (c: Customer) => (c.nextStepDue ? new Date(new Date(c.nextStepDue).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : "");

export function matchesCheck(id: CheckId, c: Customer, now: number, today: string): boolean {
  if (failed(c)) return false;
  switch (id) {
    case "unassigned":
      return c.stage === "lead" && c.owner === UNASSIGNED && ageMs(c.createdAt, now) >= FIRST_CONTACT_HOURS * 3_600_000;
    case "noContact":
      return (
        c.stage === "lead" &&
        c.owner !== UNASSIGNED &&
        ageMs(c.createdAt, now) >= FIRST_CONTACT_HOURS * 3_600_000 &&
        c.nextStep === "첫 컨택 필요" &&
        !c.activities.some((a) => a.type === "note")
      );
    case "overdue": {
      const d = dueDayOf(c);
      return c.stage !== "won" && d !== "" && d < today;
    }
    case "stale":
      return (c.stage === "discovery" || c.stage === "proposal") && ageMs(c.lastActivityAt, now) >= STALE_DAYS * DAY_MS;
    case "noAmount":
      return c.stage === "won" && contractAmountOf(c.tags) === 0;
  }
}

export function runChecks(customers: Customer[], now: number, today: string): Record<CheckId, number> {
  const out: Record<CheckId, number> = { unassigned: 0, noContact: 0, overdue: 0, stale: 0, noAmount: 0 };
  for (const c of customers) for (const { id } of CHECKS) if (matchesCheck(id, c, now, today)) out[id]++;
  return out;
}

// 담당자별로 지금 맡고 있는 진행 중(계약 전) 고객 수
export function loadByOwner(customers: Customer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of customers) {
    if (failed(c) || c.stage === "won" || c.owner === UNASSIGNED) continue;
    out[c.owner] = (out[c.owner] ?? 0) + 1;
  }
  return out;
}
