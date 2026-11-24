import { parseHistory } from "./lead-history";
import { contractAmountOf } from "./lead-fields";
import { DAY_MS } from "./lead-cleanup";
import { isContracted } from "./lead-report";
import { contractedAt } from "./lead-target";
import type { Customer } from "./types";

// 성사 이유: 계약으로 전환할 때 "왜 이겼는지"를 고르면 상담 내용에 "[날짜 시각 이름] (메모) 성사 이유: 가격" 줄로 남는다(시트에 이유 칸이 없어서).
// 종료 사유(lead-closed)와 한 쌍으로 리포트에서 이긴 이유 / 진 이유를 비교한다.

export const WIN_REASONS = ["가격", "포트폴리오", "응대 속도", "추천·재계약", "기타"] as const;
export type WinReason = (typeof WIN_REASONS)[number];
export const WIN_NOTE_TYPE = "메모"; // 성사 이유 기록 줄에 붙는 유형
export const winReasonNote = (reason: WinReason) => `성사 이유: ${reason}`;

const PREFIX = "성사 이유: ";
const consultOf = (c: Customer) => c.activities.find((a) => a.type === "note" && a.summary === "1차 상담 내용")?.detail;

// 상담 내용에서 가장 최근의 성사 이유(없으면 null)
export function winReasonOf(consult: string | undefined): WinReason | null {
  const entries = parseHistory(consult).entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = entries[i].text.trim();
    if (!t.startsWith(PREFIX)) continue;
    const r = t.slice(PREFIX.length).trim();
    if ((WIN_REASONS as readonly string[]).includes(r)) return r as WinReason;
  }
  return null;
}

export type WinRow = { reason: WinReason | "none"; count: number; amount: number };

// 기간(days, null이면 전체) 안에 계약한 고객의 성사 이유별 건수와 계약 금액. 이유를 안 남긴 계약은 none.
export function wonReasonBreakdown(customers: Customer[], now: number, days: number | null): { rows: WinRow[]; total: number } {
  const map = new Map<WinRow["reason"], WinRow>([...WIN_REASONS, "none" as const].map((r) => [r, { reason: r, count: 0, amount: 0 }]));
  let total = 0;
  for (const c of customers) {
    if (!isContracted(c)) continue;
    const when = contractedAt(c, now);
    if (days !== null && (!when || when.at < now - days * DAY_MS)) continue;
    const row = map.get(winReasonOf(consultOf(c)) ?? "none")!;
    row.count++;
    row.amount += contractAmountOf(c.tags);
    total++;
  }
  return { rows: [...map.values()], total };
}
