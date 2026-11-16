import { CLOSE_REASONS, type CloseReason } from "./lead-cleanup";
import { parseHistory } from "./lead-history";
import type { Customer } from "./types";

// 종료 사유 집계: 종료한 고객이 어떤 이유로 종료됐는지를 채널·서비스별로 센다. 시트 데이터만으로 계산하고 아무것도 쓰지 않는다.
// 사유는 종료 처리할 때 상담 기록에 "[날짜 시각 이름] (메모) 종료 사유: 무응답" 줄로 남는다. 사유 없이 종료했거나 시트에서 직접 종료한 고객은 '사유 없음'.

export const DAY_MS = 86_400_000;
const FAILED_TAG = "실패/종료";

export type ReasonKey = CloseReason | "none";
export const REASON_KEYS: readonly ReasonKey[] = [...CLOSE_REASONS, "none"];
export const REASON_LABEL: Record<ReasonKey, string> = { 무응답: "무응답", 가격: "가격", 시기: "시기", 경쟁사: "경쟁사", 기타: "기타", none: "사유 없음" };

const PREFIX = "종료 사유: ";

// 상담 내용에서 가장 최근의 종료 사유(없으면 null). 종료 해제 뒤 다시 종료하면 마지막 사유를 쓴다.
export function closeReasonOf(consult: string | undefined): CloseReason | null {
  const entries = parseHistory(consult).entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = entries[i].text.trim();
    if (!t.startsWith(PREFIX)) continue;
    const r = t.slice(PREFIX.length).trim();
    if ((CLOSE_REASONS as readonly string[]).includes(r)) return r as CloseReason;
  }
  return null;
}

export type ReasonRow = {
  key: string;
  inquiries: number; // 이 기간에 들어온 문의 고객(종료 포함)
  closed: number;
  rate: number; // closed / inquiries
  byReason: Record<ReasonKey, number>;
};

const emptyBy = (): Record<ReasonKey, number> => ({ 무응답: 0, 가격: 0, 시기: 0, 경쟁사: 0, 기타: 0, none: 0 });

// keysOf가 돌려주는 여러 키에 모두 센다(서비스는 한 고객이 여러 서비스를 문의할 수 있다). days가 null이면 전체 기간(문의 시점 기준).
export function closedReasonBreakdown(
  customers: Customer[],
  consultOf: (id: string) => string | undefined,
  now: number,
  days: number | null,
  keysOf: (c: Customer) => string[]
): ReasonRow[] {
  const map = new Map<string, ReasonRow>();
  for (const c of customers) {
    const t = Date.parse(c.createdAt);
    if (Number.isNaN(t) || (days !== null && t < now - days * DAY_MS)) continue;
    const closed = c.tags.includes(FAILED_TAG);
    const reason: ReasonKey = closed ? (closeReasonOf(consultOf(c.id)) ?? "none") : "none";
    for (const key of keysOf(c)) {
      const row = map.get(key) ?? { key, inquiries: 0, closed: 0, rate: 0, byReason: emptyBy() };
      row.inquiries++;
      if (closed) {
        row.closed++;
        row.byReason[reason]++;
      }
      map.set(key, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, rate: r.inquiries ? r.closed / r.inquiries : 0 }))
    .sort((a, b) => b.closed - a.closed || b.inquiries - a.inquiries);
}

// 전체 합계(고객 한 명을 한 번만 센다)
export function closedTotals(customers: Customer[], consultOf: (id: string) => string | undefined, now: number, days: number | null) {
  const rows = closedReasonBreakdown(customers, consultOf, now, days, () => ["all"]);
  return rows[0] ?? { key: "all", inquiries: 0, closed: 0, rate: 0, byReason: emptyBy() };
}
