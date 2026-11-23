import { dueDayOf } from "./lead-checks";
import { closeReasonOf } from "./lead-closed";
import { DAY_MS, idleDays, type CloseReason } from "./lead-cleanup";
import { todayKst } from "./lead-fields";
import { isFailed, servicesOf } from "./lead-report";
import { UNASSIGNED } from "./sales-reps";
import type { Customer } from "./types";

// 리터치 풀: 쌓여 있는 옛 DB(문의가 들어온 지 오래된 고객)를 조건으로 걸러 영업에게 다시 배정해 재접촉한다.
// 시트에는 "리드 온도(COLD)" 칸이 없어서, 온도 대신 ① 종료 사유(가격·경쟁사로 진 건은 기본 제외) ② 적혀 있는 가능성(%) ③ 마지막 움직임으로 거른다.
// 기준 시각(now)을 밖에서 받아서 같은 입력이면 항상 같은 결과가 나온다.

export const MIN_AGE_OPTIONS = [30, 60, 90, 180] as const;
export const MAX_AGE_OPTIONS = [90, 180, 365] as const; // null = 제한 없음
export const IDLE_OPTIONS = [14, 30, 60] as const;
export const PROBABILITY_OPTIONS = [10, 30, 50] as const;
// 다시 연락해도 가망이 낮은 종료 사유(기본 제외). 시기·무응답·기타는 다시 물어볼 만하다.
export const COLD_REASONS: readonly CloseReason[] = ["가격", "경쟁사"];

// 리터치 풀에서 배정할 때 '다음 액션 플랜' 칸이 비어 있으면 채우는 문구(이미 적힌 내용은 덮어쓰지 않는다)
export const RETOUCH_NEXT_ACTION = "리터치: 이전 문의 재접촉";

export type RetouchFilter = {
  minAgeDays: number; // 문의가 들어온 지 N일 이상
  maxAgeDays: number | null; // N일 이하(null이면 제한 없음)
  idleMinDays: number; // 마지막 움직임이 N일 이상 전(최근에 누가 만진 건은 제외)
  includeClosed: boolean; // 종료(실패/종료)로 처리된 건도 포함
  excludeReasons: CloseReason[]; // 종료 건 중 이 사유는 제외(사유가 안 적힌 종료 건은 포함)
  minProbability: number | null; // 가능성이 이 값 미만으로 적힌 건 제외(적혀 있지 않은 건은 포함)
  service: string; // "all" 또는 서비스 이름
  unassignedOnly: boolean;
};

export const DEFAULT_RETOUCH_FILTER: RetouchFilter = {
  minAgeDays: 60,
  maxAgeDays: null,
  idleMinDays: 30,
  includeClosed: true,
  excludeReasons: [...COLD_REASONS],
  minProbability: null,
  service: "all",
  unassignedOnly: false,
};

export type RetouchRow = {
  customer: Customer;
  ageDays: number; // 첫 문의로부터
  idleDays: number; // 마지막 움직임으로부터
  closed: boolean;
  reason: CloseReason | null; // 종료 사유(종료 건만)
  probability: number | null; // 적혀 있는 가능성(%)
};

const consultOf = (c: Customer) => c.activities.find((a) => a.type === "note" && a.summary === "1차 상담 내용")?.detail;

export function probabilityOf(c: Customer): number | null {
  const tag = c.tags.find((t) => t.startsWith("가능성 "));
  if (!tag) return null;
  const n = Number(tag.replace(/\D/g, ""));
  return Number.isFinite(n) && tag.replace(/\D/g, "") !== "" ? n : null;
}

// 조건에 맞는 고객(최근에 들어온 순). 계약된 고객과 앞으로 리터치 일정이 잡힌 고객은 이미 진행 중이라 제외한다.
export function retouchPool(customers: Customer[], f: RetouchFilter, now: number): RetouchRow[] {
  const today = todayKst(now);
  const rows: RetouchRow[] = [];
  for (const c of customers) {
    if (c.stage === "won") continue;
    const created = Date.parse(c.createdAt);
    if (Number.isNaN(created)) continue;
    const ageDays = Math.floor((now - created) / DAY_MS);
    if (ageDays < f.minAgeDays || (f.maxAgeDays !== null && ageDays > f.maxAgeDays)) continue;

    const closed = isFailed(c);
    if (closed && !f.includeClosed) continue;
    const reason = closed ? closeReasonOf(consultOf(c)) : null;
    if (reason && f.excludeReasons.includes(reason)) continue;

    const idle = idleDays(c, now);
    if (idle < f.idleMinDays) continue;
    const due = dueDayOf(c);
    if (!closed && due && due >= today) continue; // 리터치 일정이 남아 있으면 이미 진행 중

    const probability = probabilityOf(c);
    if (f.minProbability !== null && probability !== null && probability < f.minProbability) continue;
    if (f.service !== "all" && !servicesOf(c).includes(f.service)) continue;
    if (f.unassignedOnly && c.owner !== UNASSIGNED) continue;

    rows.push({ customer: c, ageDays, idleDays: idle, closed, reason, probability });
  }
  return rows.sort((a, b) => (a.customer.createdAt < b.customer.createdAt ? 1 : -1));
}

// 리터치 문구(복사해서 문자·메일에 쓴다). 서비스가 알려져 있으면 한 줄에 넣는다.
export function retouchMessage(company: string, services: string[]): string {
  const name = company && company !== "상호 미기재" ? `${company} 담당자님` : "담당자님";
  const about = services.length ? `${services.join("·")} 관련해서 ` : "";
  return `안녕하세요, ${name}. 이전에 ${about}한 번 문의 주셔서 연락드렸었는데, 현재 필요하신 서비스는 없으실까요?`;
}
