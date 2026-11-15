import { dueDayOf } from "./lead-checks";
import { todayKst } from "./lead-fields";
import { parseNoteStamps } from "./lead-response";
import type { Customer } from "./types";

// 정리 대기함: 오래 움직임이 없는 리드를 종료 후보로 모은다. 시트 데이터만으로 계산하고 아무것도 바꾸지 않는다.
// 종료는 사람이 확인한 뒤 누른다(자동으로 종료하지 않는다).

export const DAY_MS = 86_400_000;
export const CLEANUP_DAYS = [14, 30, 60, 90, 180] as const;
export const DEFAULT_CLEANUP_DAYS = 30;
const FAILED_TAG = "실패/종료";

// 종료 사유(선택). 시트에 사유 칸이 없어서 상담 기록에 "(메모) 종료 사유: 무응답"으로 남긴다.
export const CLOSE_REASONS = ["무응답", "가격", "시기", "경쟁사", "기타"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];
export const CLOSE_NOTE_TYPE = "메모"; // 종료 사유 기록 줄에 붙는 유형
export const reasonNote = (reason: CloseReason) => `종료 사유: ${reason}`;

// 마지막 움직임: 마지막 문의·최근 연락일, 그리고 상담 내용에 남은 기록 시각 중 가장 늦은 때(ms)
export function lastMoveMs(c: Customer, now: number): number {
  const base = Date.parse(c.lastActivityAt);
  const stamps = c.activities
    .filter((a) => a.type === "note" && a.summary === "1차 상담 내용" && a.detail)
    .flatMap((a) => parseNoteStamps(a.detail ?? "", c.createdAt, now));
  return Math.max(Number.isNaN(base) ? 0 : base, ...stamps);
}

export const idleDays = (c: Customer, now: number) => Math.max(0, Math.floor((now - lastMoveMs(c, now)) / DAY_MS));

// 종료 후보: 진행 중(리드·상담·제안), 앞으로 예정된 일정이 없고, 마지막 움직임이 days일 이상 전
export function isCleanupCandidate(c: Customer, now: number, days: number): boolean {
  if (c.tags.includes(FAILED_TAG) || c.stage === "won") return false;
  const due = dueDayOf(c);
  if (due && due >= todayKst(now)) return false; // 리터치 일정이 남아 있으면 아직 진행 중
  return idleDays(c, now) >= days;
}

// 후보 목록(가장 오래 움직임 없는 순)
export function cleanupCandidates(customers: Customer[], now: number, days: number): Customer[] {
  return customers
    .filter((c) => isCleanupCandidate(c, now, days))
    .sort((a, b) => lastMoveMs(a, now) - lastMoveMs(b, now));
}

// 기준별 후보 수(칩에 보여 줄 값)
export function cleanupCounts(customers: Customer[], now: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of CLEANUP_DAYS) out[d] = 0;
  for (const c of customers) {
    if (c.tags.includes(FAILED_TAG) || c.stage === "won") continue;
    const due = dueDayOf(c);
    if (due && due >= todayKst(now)) continue;
    const idle = idleDays(c, now);
    for (const d of CLEANUP_DAYS) if (idle >= d) out[d]++;
  }
  return out;
}
