import { CHECKS, matchesCheck, runChecks, type CheckId } from "./lead-checks";
import { DEFAULT_CLEANUP_DAYS, cleanupCounts } from "./lead-cleanup";
import { homeSummary } from "./lead-home";
import { todayKst } from "./lead-fields";
import { formatDuration, responseStats } from "./lead-response";
import type { Customer } from "./types";

// 알림 요약(Slack 등에 보내는 글). 시트 데이터만으로 계산하고 아무것도 쓰지 않는다. 오늘 날짜와 기준 시각은 밖에서 받는다.
// Slack 글 서식(mrkdwn): 굵게 *글*, 링크 <주소|이름>, 목록은 '•'. 사용자가 입력한 글(업체명·다음 액션)에 &, <, > 가 들어 있으면
// Slack이 특수 문법으로 읽지 않도록 &amp; &lt; &gt; 로 바꾼다(그래야 <!channel> 같은 글이 전체 알림이 되지 않는다).

export const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type DigestOptions = {
  appUrl?: string; // 인트라넷 주소(있으면 맨 아래에 링크)
  maxNames?: number; // 사람마다 보여 줄 일정 개수
  hideNames?: boolean; // true면 업체명·다음 액션을 빼고 건수만 보낸다
};

const n = (v: number) => v.toLocaleString("ko-KR");

function repLine(name: string, mine: Customer[], now: number, today: string, opts: DigestOptions): string[] {
  const s = homeSummary(mine, today);
  const checks = runChecks(mine, now, today);
  const parts: string[] = [];
  if (s.dueSoon.length > 0) parts.push(`오늘·내일 일정 ${n(s.dueSoon.length)}건${s.overdue > 0 ? ` (지난 일정 ${n(s.overdue)}건)` : ""}`);
  for (const ch of CHECKS) {
    if (ch.id === "overdue" || ch.id === "unassigned" || ch.id === "noAmount") continue; // 일정은 위에서, 미배정은 팀 줄에서, 금액 누락은 사람별 알림에 넣지 않는다
    if (checks[ch.id as CheckId] > 0) parts.push(`${ch.label} ${n(checks[ch.id as CheckId])}건`);
  }
  const lines = [`*${escapeSlack(name)}* · ${parts.length ? parts.join(" · ") : "확인할 항목이 없습니다"}`];
  if (!opts.hideNames) {
    for (const d of s.dueSoon.slice(0, opts.maxNames ?? 3)) {
      const when = d.day < today ? `${d.day.slice(5).replace("-", ".")} 지남` : d.day === today ? "오늘" : "내일";
      lines.push(`• ${escapeSlack(d.company)}${d.nextStep ? ` — ${escapeSlack(d.nextStep)}` : ""} (${when})`);
    }
    if (s.dueSoon.length > (opts.maxNames ?? 3)) lines.push(`• 외 ${n(s.dueSoon.length - (opts.maxNames ?? 3))}건`);
  }
  return lines;
}

export function buildDigest(customers: Customer[], now: number, reps: readonly string[], opts: DigestOptions = {}): string {
  const today = todayKst(now);
  const date = new Date(`${today}T12:00:00+09:00`).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" });
  const lines: string[] = [`*오늘의 영업 알림* · ${date}`];

  for (const rep of reps) {
    lines.push("", ...repLine(rep, customers.filter((c) => c.owner === rep), now, today, opts));
  }

  const unassigned = customers.filter((c) => matchesCheck("unassigned", c, now, today)).length;
  const cleanup = cleanupCounts(customers, now)[DEFAULT_CLEANUP_DAYS] ?? 0;
  const r = responseStats(customers, now);
  const team: string[] = [];
  if (unassigned > 0) team.push(`24시간 넘게 미배정 ${n(unassigned)}건`);
  if (cleanup > 0) team.push(`정리 대기 ${n(cleanup)}건(${DEFAULT_CLEANUP_DAYS}일 이상)`);
  if (r.measured > 0) team.push(`응답 속도 중앙값 ${formatDuration(r.medianMs)}(측정 ${n(r.measured)}/${n(r.total)}건)`);
  lines.push("", `*팀* · ${team.length ? team.join(" · ") : "확인할 항목이 없습니다"}`);

  if (opts.appUrl) lines.push("", `<${opts.appUrl}|인트라넷 열기>`);
  return lines.join("\n");
}
