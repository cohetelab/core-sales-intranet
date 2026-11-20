import { UNASSIGNED } from "./sales-reps";
import type { Customer } from "./types";

// 응답 속도: 문의가 들어온 뒤 "첫 기록"까지 걸린 시간.
// 인트라넷에서 상담 내용을 저장하면 시트의 '1차 상담 내용' 칸에 "[11.06 14:30 Ian] 내용" 줄이 쌓인다.
// 그 줄의 시각을 읽어 가장 이른 것을 첫 기록으로 본다. 전화만 하고 기록하지 않은 건 잡히지 않는다.
// 기준 시각(now)을 밖에서 받아서 같은 입력이면 항상 같은 결과가 나온다.

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;
const KST_MS = 9 * 3_600_000;
const FAILED_TAG = "실패/종료";
const NOTE_SUMMARY = "1차 상담 내용";
const STAMP = /\[(\d{2})\.(\d{2}) (\d{2}):(\d{2}) [^\]\n]{1,40}\]/g;
// 단계를 옮길 때 자동으로 남기는 줄("[11.20 16:30 Ian] (단계) 연락됨 → …"). 사람이 연락한 기록이 아니다.
const STAGE_LINE = /^\[\d{2}\.\d{2} \d{2}:\d{2} [^\]\n]{1,40}\][ \t]?\(단계\)/;
export const withoutStageLines = (text: string) => text.split("\n").filter((l) => !STAGE_LINE.test(l)).join("\n");

// 상담 내용 안의 "[MM.DD HH:mm 이름]" 시각들을 시각(ms)으로. 표시에 연도가 없어서
// 문의가 들어온 해로 두되, 그러면 문의보다 이르게 되는 경우(연말→연초)는 다음 해로 본다.
export function parseNoteStamps(text: string, inquiryIso: string, now: number, opts: { skipStage?: boolean } = {}): number[] {
  if (opts.skipStage) text = withoutStageLines(text);
  const t0 = Date.parse(inquiryIso);
  if (Number.isNaN(t0)) return [];
  const y0 = new Date(t0 + KST_MS).getUTCFullYear();
  const out: number[] = [];
  for (const m of text.matchAll(STAMP)) {
    for (const y of [y0, y0 + 1]) {
      const ts = Date.parse(`${y}-${m[1]}-${m[2]}T${m[3]}:${m[4]}:00+09:00`);
      if (Number.isNaN(ts)) break; // 달력에 없는 날짜
      if (ts >= t0 - 60_000) {
        if (ts <= now + DAY_MS) out.push(ts);
        break;
      }
    }
  }
  return out;
}

// 이 고객의 첫 기록까지 걸린 시간(ms). 기록이 없으면 null.
export function firstResponseMs(c: Customer, now: number): number | null {
  const t0 = Date.parse(c.createdAt);
  if (Number.isNaN(t0)) return null;
  const stamps = c.activities
    .filter((a) => a.type === "note" && a.summary === NOTE_SUMMARY && a.detail)
    .flatMap((a) => parseNoteStamps(a.detail ?? "", c.createdAt, now, { skipStage: true })); // 응답 속도는 연락 기록만(단계 이동은 제외)
  if (stamps.length === 0) return null;
  return Math.max(0, Math.min(...stamps) - t0);
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export type ResponseStats = {
  total: number; // 최근 N일에 들어온 문의 고객 수(실패/종료 제외)
  measured: number; // 그중 첫 기록이 있는 수
  medianMs: number | null;
  within1h: number; // 측정된 것 중 1시간 이내
  within24h: number;
  waiting24h: number; // 24시간이 지나도록 아직 첫 기록이 없는 고객
  byOwner: { owner: string; measured: number; medianMs: number | null }[];
};

export function responseStats(customers: Customer[], now: number, windowDays = WINDOW_DAYS): ResponseStats {
  const since = now - windowDays * DAY_MS;
  const inWindow = customers.filter((c) => !c.tags.includes(FAILED_TAG) && Date.parse(c.createdAt) >= since);
  const rows = inWindow.map((c) => ({ c, ms: firstResponseMs(c, now) }));
  const measured = rows.filter((r): r is { c: Customer; ms: number } => r.ms !== null);
  const owners = new Map<string, number[]>();
  for (const { c, ms } of measured) owners.set(c.owner, [...(owners.get(c.owner) ?? []), ms]);
  return {
    total: inWindow.length,
    measured: measured.length,
    medianMs: median(measured.map((r) => r.ms)),
    within1h: measured.filter((r) => r.ms <= 3_600_000).length,
    within24h: measured.filter((r) => r.ms <= DAY_MS).length,
    waiting24h: rows.filter((r) => r.ms === null && now - Date.parse(r.c.createdAt) >= DAY_MS).length,
    byOwner: [...owners.entries()]
      .map(([owner, xs]) => ({ owner, measured: xs.length, medianMs: median(xs) }))
      .sort((a, b) => (a.owner === UNASSIGNED ? 1 : b.owner === UNASSIGNED ? -1 : b.measured - a.measured)),
  };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 === 0 ? `${h}시간` : `${h}시간 ${min % 60}분`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}일` : `${d}일 ${h % 24}시간`;
}

// 상담 내용에 이미 시각이 붙은 기록 줄이 있는지(있으면 '첫 컨택 완료' 버튼은 필요 없다)
export const hasStampedNote = (consult: string | undefined) => new RegExp(STAMP.source).test(withoutStageLines(consult ?? ""));
