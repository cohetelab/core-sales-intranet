import { contractAmountOf } from "./lead-fields";
import { CHANNELS, SERVICE_LABELS } from "./lead-sheet";
import type { Customer } from "./types";

// 채널·서비스·월별 문의 → 상담 → 계약 퍼널. 시트 데이터만으로 계산하고 아무것도 쓰지 않는다.
// 시트의 '단계' 칸이 거의 비어 있어도 쓸 수 있게, 계약은 "단계가 계약이거나 계약 금액이 적힌 고객"으로,
// 상담은 "단계가 리드가 아니거나 계약이거나 상담 내용이 있는 고객"으로 본다.

export const DAY_MS = 86_400_000;
const FAILED_TAG = "실패/종료";
const KST_MS = 9 * 3_600_000;

export const isFailed = (c: Customer) => c.tags.includes(FAILED_TAG);
export const isContracted = (c: Customer) => !isFailed(c) && (c.stage === "won" || contractAmountOf(c.tags) > 0);
export const isEngaged = (c: Customer) =>
  !isFailed(c) && (c.stage !== "lead" || isContracted(c) || c.activities.some((a) => a.type === "note" && a.summary === "1차 상담 내용"));

export const channelOf = (c: Customer): string => c.tags.find((t) => (CHANNELS as readonly string[]).includes(t)) ?? "기타";
export const servicesOf = (c: Customer): string[] => {
  const hit = SERVICE_LABELS.filter((l) => c.category.includes(l));
  return hit.length ? [...hit] : ["미분류"];
};
export const monthOf = (c: Customer): string => new Date(Date.parse(c.createdAt) + KST_MS).toISOString().slice(0, 7);

// 최근 N일에 들어온 고객만(days가 null이면 전체). 실패/종료는 문의 수에서도 뺀다.
export function inWindow(customers: Customer[], now: number, days: number | null): Customer[] {
  return customers.filter((c) => !isFailed(c) && !Number.isNaN(Date.parse(c.createdAt)) && (days === null || Date.parse(c.createdAt) >= now - days * DAY_MS));
}

export type FunnelRow = { key: string; inquiries: number; engaged: number; contracted: number; amount: number; rate: number };

// keysOf가 돌려주는 여러 키에 모두 센다(서비스는 한 고객이 여러 서비스를 문의할 수 있다).
export function funnelBy(customers: Customer[], keysOf: (c: Customer) => string[]): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  for (const c of customers) {
    for (const key of keysOf(c)) {
      const row = map.get(key) ?? { key, inquiries: 0, engaged: 0, contracted: 0, amount: 0, rate: 0 };
      row.inquiries++;
      if (isEngaged(c)) row.engaged++;
      if (isContracted(c)) {
        row.contracted++;
        row.amount += contractAmountOf(c.tags);
      }
      map.set(key, row);
    }
  }
  return [...map.values()].map((r) => ({ ...r, rate: r.inquiries ? r.contracted / r.inquiries : 0 })).sort((a, b) => b.inquiries - a.inquiries);
}

export type MonthRow = { month: string; inquiries: number; contracted: number; byChannel: Record<string, number> };

export function monthly(customers: Customer[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const c of customers) {
    const month = monthOf(c);
    const row = map.get(month) ?? { month, inquiries: 0, contracted: 0, byChannel: {} };
    row.inquiries++;
    if (isContracted(c)) row.contracted++;
    const ch = channelOf(c);
    row.byChannel[ch] = (row.byChannel[ch] ?? 0) + 1;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

export function totals(customers: Customer[]) {
  const contracted = customers.filter(isContracted);
  return {
    inquiries: customers.length,
    engaged: customers.filter(isEngaged).length,
    contracted: contracted.length,
    amount: contracted.reduce((s, c) => s + contractAmountOf(c.tags), 0),
    withAmount: contracted.filter((c) => contractAmountOf(c.tags) > 0).length,
    // 단계 칸은 비어 있고 계약 금액으로만 계약으로 본 고객 수(시트 입력 습관을 알려 주는 값)
    viaAmountOnly: contracted.filter((c) => c.stage !== "won").length,
  };
}
