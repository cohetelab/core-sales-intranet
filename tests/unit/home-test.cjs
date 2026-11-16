const { load } = require("../support/run.cjs");
const h = load("lead-home");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const TODAY = "2026-11-10";
const day = (d) => new Date(Date.parse(`${d}T12:00:00+09:00`)).toISOString();
let n = 0;
const mk = (o) => ({ id: `c${++n}`, company: `회사${n}`, stage: "lead", tags: [], activities: [], nextStep: "", ...o });

const list = [
  mk({ stage: "lead" }),
  mk({ stage: "discovery", nextStepDue: day("2026-11-09"), nextStep: "견적 발송" }), // 어제 → 지남
  mk({ stage: "proposal", nextStepDue: day("2026-11-10"), nextStep: "통화" }), // 오늘
  mk({ stage: "lead", nextStepDue: day("2026-11-11"), nextStep: "미팅" }), // 내일
  mk({ stage: "lead", nextStepDue: day("2026-11-13"), nextStep: "연락" }), // 3일 뒤
  mk({ stage: "lead", nextStepDue: day("2026-11-20"), nextStep: "먼 일정" }), // 10일 뒤
  mk({ stage: "won", tags: ["계약금액 ₩2,000,000"], nextStepDue: day("2026-11-01") }), // 계약 → 일정 대상 아님
  mk({ stage: "won" }),
  mk({ stage: "lead", tags: ["실패/종료"], nextStepDue: day("2026-11-01") }), // 실패 → 전부 제외
];
const s = h.homeSummary(list, TODAY);
ok("전체 8(실패 제외) · 진행 6 · 계약 2", s.total === 8 && s.open === 6 && s.won === 2, JSON.stringify([s.total, s.open, s.won]));
ok("계약 금액 합계 200만 · 금액 기재 1곳", s.wonAmount === 2000000 && s.wonWithAmount === 1);
ok("전환율 2/8", Math.abs(s.conversionRate - 0.25) < 1e-9);
ok("단계별: 리드 4 · 상담 1 · 제안 1 · 계약 2", JSON.stringify(s.stageCounts) === JSON.stringify({ lead: 4, discovery: 1, proposal: 1, won: 2 }), JSON.stringify(s.stageCounts));
ok("오늘·내일 일정: 어제(지남)·오늘·내일 3건, 날짜순", s.dueSoon.map((d) => d.nextStep).join() === "견적 발송,통화,미팅", s.dueSoon.map((d) => d.nextStep).join());
ok("기한 지난 일정 1건", s.overdue === 1);
ok("3일 안 일정: 오늘·내일·3일 뒤 = 3건(어제·10일 뒤 제외)", s.due3 === 3, String(s.due3));
ok("일정 있는 고객 5명(계약·실패 제외)", s.withDue === 5, String(s.withDue));

const acts = [
  mk({ activities: [{ id: "a", summary: "문의 접수", at: "2026-11-01T01:00:00.000Z" }, { id: "b", summary: "상담", at: "2026-11-09T01:00:00.000Z" }] }),
  mk({ activities: [{ id: "c", summary: "메모", at: "2026-11-05T01:00:00.000Z" }, { id: "d", summary: "문의 접수", at: "2026-11-10T01:00:00.000Z" }, { id: "e", summary: "x", at: "2026-10-01T01:00:00.000Z" }, { id: "f", summary: "y", at: "2026-10-02T01:00:00.000Z" }] }),
  mk({ tags: ["실패/종료"], activities: [{ id: "z", summary: "제외", at: "2026-12-01T01:00:00.000Z" }] }),
];
const a = h.homeSummary(acts, TODAY).activity;
ok("최근 활동 5건, 최신순, 실패 고객 제외", a.length === 5 && a[0].summary === "문의 접수" && a[0].at.startsWith("2026-11-10") && a.every((x) => x.summary !== "제외"), a.map((x) => x.at.slice(0, 10)).join());

const e = h.homeSummary([], TODAY);
ok("고객이 없으면 0(안 터짐)", e.total === 0 && e.conversionRate === 0 && e.dueSoon.length === 0 && e.activity.length === 0);

const NOW = Date.parse("2026-11-12T12:00:00+09:00");
const ago = (ms) => h.agoFrom(new Date(NOW - ms).toISOString(), NOW);
ok("상대 시간: 방금 0분 · 5분 · 59분 · 1시간 · 23시간 · 1일 · 30일", [0, 5 * 60000, 59 * 60000, 60 * 60000, 23 * 3600000, 24 * 3600000, 30 * 86400000].map(ago).join() === "0분 전,5분 전,59분 전,1시간 전,23시간 전,1일 전,30일 전", [0, 5 * 60000, 59 * 60000, 60 * 60000, 23 * 3600000, 24 * 3600000, 30 * 86400000].map(ago).join());
ok("상대 시간: 미래(시계 차이)는 0분 전 · 이상한 값은 -", h.agoFrom(new Date(NOW + 5 * 60000).toISOString(), NOW) === "0분 전" && h.agoFrom("이상한값", NOW) === "-");
console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
