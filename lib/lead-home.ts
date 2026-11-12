import { contractAmountOf } from "./lead-fields";
import { dueDayOf } from "./lead-checks";
import type { Customer, DealStage } from "./types";

// 홈 화면 요약. 시트 데이터만으로 계산하고 아무것도 쓰지 않는다. 오늘 날짜(today, 한국 기준 YYYY-MM-DD)는 밖에서 받는다.

const FAILED_TAG = "실패/종료";
const failed = (c: Customer) => c.tags.includes(FAILED_TAG);

const addDays = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// "N분 전 / N시간 전 / N일 전". 기준 시각(now)을 밖에서 받는다(format.ts의 timeAgo는 데모용 고정 날짜 기준이라 쓰지 않는다).
export function agoFrom(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "-";
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export type DueItem = { id: string; company: string; nextStep: string; day: string };
export type ActivityItem = { key: string; company: string; summary: string; at: string };

export type HomeSummary = {
  total: number; // 실패/종료를 뺀 전체 고객
  open: number; // 계약 전(진행 중)
  won: number;
  wonAmount: number;
  wonWithAmount: number;
  conversionRate: number; // 0~1, 계약 / 전체
  stageCounts: Record<DealStage, number>;
  dueSoon: DueItem[]; // 오늘·내일까지 처리할 일정(지난 것 포함), 날짜순
  overdue: number;
  due3: number; // 오늘부터 3일 안의 일정
  withDue: number; // 일정이 있는 고객 수(계약 전)
  activity: ActivityItem[]; // 최근 활동 5건
};

export function homeSummary(customers: Customer[], today: string): HomeSummary {
  const active = customers.filter((c) => !failed(c));
  const won = active.filter((c) => c.stage === "won");
  const stageCounts: Record<DealStage, number> = { lead: 0, discovery: 0, proposal: 0, won: 0 };
  for (const c of active) stageCounts[c.stage]++;

  const dated = active.filter((c) => c.stage !== "won" && dueDayOf(c));
  const tomorrow = addDays(today, 1);
  const dueSoon = dated
    .filter((c) => dueDayOf(c) <= tomorrow)
    .map((c) => ({ id: c.id, company: c.company, nextStep: c.nextStep ?? "", day: dueDayOf(c) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const activity = active
    .flatMap((c) => c.activities.map((a) => ({ key: `${c.id}-${a.id}`, company: c.company, summary: a.summary, at: a.at })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 5);

  return {
    total: active.length,
    open: active.length - won.length,
    won: won.length,
    wonAmount: won.reduce((s, c) => s + contractAmountOf(c.tags), 0),
    wonWithAmount: won.filter((c) => contractAmountOf(c.tags) > 0).length,
    conversionRate: active.length ? won.length / active.length : 0,
    stageCounts,
    dueSoon,
    overdue: dueSoon.filter((d) => d.day < today).length,
    due3: dated.filter((c) => dueDayOf(c) >= today && dueDayOf(c) <= addDays(today, 3)).length,
    withDue: dated.length,
    activity,
  };
}
