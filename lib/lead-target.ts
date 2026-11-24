import { parseHistory } from "./lead-history";
import { contractAmountOf } from "./lead-fields";
import { parseNoteStamps } from "./lead-response";
import { isContracted } from "./lead-report";
import { SALES_REPS } from "./sales-reps";
import type { Customer } from "./types";

// 월별 계약 금액과 목표 대비 달성률. 시트에는 계약 날짜 칸이 없어서 계약 시점을 이렇게 정한다.
//  ① 단계를 '성사'로 옮길 때 인트라넷이 남기는 "[11.20 16:30 Ian] (단계) … → 성사" 줄의 시각(정확)
//  ② 그 줄이 없는 옛 계약 건은 마지막 활동 시점(최근 연락일·마지막 문의)으로 추정(estimated)
// 계약 금액은 시트의 '계약 금액' 칸 값이고, 비어 있으면 0원으로 세되 "금액 미기재"로 따로 센다.
// 기준 시각(now)을 밖에서 받아서 같은 입력이면 항상 같은 결과가 나온다.

const KST_MS = 9 * 3_600_000;
export const monthKey = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 7);
export const OTHER_OWNER = "기타(미배정·퇴사)";

const consultOf = (c: Customer) => c.activities.find((a) => a.type === "note" && a.summary === "1차 상담 내용")?.detail;

// 계약 시점(ms)과 정확 여부. 날짜를 알 수 없으면 null.
export function contractedAt(c: Customer, now: number): { at: number; exact: boolean } | null {
  const entries = parseHistory(consultOf(c)).entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e.auto || !/→\s*성사$/.test(e.text.trim())) continue;
    const ts = parseNoteStamps(`[${e.month}.${e.day} ${e.time} x]`, c.createdAt, now);
    if (ts.length) return { at: ts[0], exact: true };
  }
  const fallback = Date.parse(c.lastActivityAt);
  return Number.isNaN(fallback) ? null : { at: fallback, exact: false };
}

export type OwnerMonth = {
  owner: string;
  amount: number; // 그 달 계약 금액 합계
  count: number; // 계약 건수
  noAmount: number; // 금액이 비어 있는 계약 건수
  estimated: number; // 계약 날짜를 추정한 건수
};

const empty = (owner: string): OwnerMonth => ({ owner, amount: 0, count: 0, noAmount: 0, estimated: 0 });
const ownerKey = (c: Customer) => ((SALES_REPS as readonly string[]).includes(c.owner) ? c.owner : OTHER_OWNER);

// 한 달(YYYY-MM)의 담당자별 계약. 등록된 영업은 계약이 없어도 줄이 있고, 나머지(미배정·퇴사)는 '기타'로 묶는다.
export function contractsByOwner(customers: Customer[], month: string, now: number): OwnerMonth[] {
  const map = new Map<string, OwnerMonth>(SALES_REPS.map((r) => [r, empty(r)]));
  for (const c of customers) {
    if (!isContracted(c)) continue;
    const when = contractedAt(c, now);
    if (!when || monthKey(when.at) !== month) continue;
    const key = ownerKey(c);
    const row = map.get(key) ?? empty(key);
    const amount = contractAmountOf(c.tags);
    row.amount += amount;
    row.count++;
    if (amount === 0) row.noAmount++;
    if (!when.exact) row.estimated++;
    map.set(key, row);
  }
  return [...map.values()];
}

export type Attainment = { pct: number | null; remaining: number | null; reached: boolean };
// 달성률 = 계약 금액 ÷ 목표. 목표가 없거나 0이면 null.
export function attainment(amount: number, target: number | undefined): Attainment {
  if (!target || target <= 0) return { pct: null, remaining: null, reached: false };
  return { pct: Math.round((amount / target) * 1000) / 10, remaining: Math.max(0, target - amount), reached: amount >= target };
}

// 최근 N개월(이번 달 포함) 키. 가장 최근이 앞.
export function recentMonths(now: number, n: number): string[] {
  const d = new Date(now + KST_MS);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return out;
}

export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
// 큰 금액은 만원 단위로 읽기 쉽게(1,250만원)
export const manwon = (v: number) => (v >= 10_000 ? `${Math.round(v / 10_000).toLocaleString("ko-KR")}만원` : won(v));
