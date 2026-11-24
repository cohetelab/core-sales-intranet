const { load } = require("../support/run.cjs");
const w = load("lead-won");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

ok("성사 이유 5가지 · 기록 문구", w.WIN_REASONS.join() === "가격,포트폴리오,응대 속도,추천·재계약,기타" && w.winReasonNote("가격") === "성사 이유: 가격" && w.WIN_NOTE_TYPE === "메모");
ok("마지막 줄의 이유를 읽음", w.winReasonOf("[11.10 10:00 Ian] (단계) 연락됨 → 성사\n[11.10 10:00 Ian] (메모) 성사 이유: 가격") === "가격");
ok("이유가 여러 번이면 가장 최근 것", w.winReasonOf("[11.10 10:00 Ian] (메모) 성사 이유: 가격\n[11.20 09:00 Ian] (메모) 성사 이유: 추천·재계약") === "추천·재계약");
ok("이유가 없으면 null · 모르는 값은 무시", w.winReasonOf("[11.10 10:00 Ian] (전화) 통화") === null && w.winReasonOf("[11.10 10:00 Ian] (메모) 성사 이유: 아무거나") === null && w.winReasonOf(undefined) === null);
ok("종료 사유 줄은 성사 이유로 읽지 않음", w.winReasonOf("[11.10 10:00 Ian] (메모) 종료 사유: 가격") === null);
ok("직접 적은 옛 내용 + 이유 줄", w.winReasonOf("3/20 전화함\n[11.12 09:00 Connor] (메모) 성사 이유: 포트폴리오") === "포트폴리오");

const NOW = Date.parse("2026-11-23T03:00:00Z");
const noteStamp = (ms) => { const s = new Date(ms + 9 * 3_600_000).toISOString(); return `[${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)} Ian]`; };
let n = 0;
const mk = (o = {}) => ({
  id: `lead-${++n}`, company: `고객${n}`, category: "숏폼", website: "-", stage: o.stage ?? "won", dealValueMonthly: 0, source: "inbound", owner: "이익재(Ian)", manager: "", email: "", phone: "",
  createdAt: "2026-09-01T01:00:00.000Z", lastActivityAt: o.lastActivityAt ?? "2026-09-01T01:00:00.000Z", contacts: [],
  activities: o.consult ? [{ type: "note", summary: "1차 상담 내용", detail: o.consult, at: "2026-11-01T00:00:00.000Z" }] : [],
  tags: ["문의DB", "홈페이지", ...(o.failed ? ["실패/종료"] : []), ...(o.amount ? [`계약금액 ₩${o.amount.toLocaleString("en-US")}`] : [])], operationStatus: "not_started",
});
const line = (ms, text) => `${noteStamp(ms)} ${text}`;
const day = (d) => NOW - d * 86_400_000;
const won = (d, reason, amount) => mk({ amount, consult: [line(day(d), "(단계) 연락됨 → 성사"), ...(reason ? [line(day(d), `(메모) 성사 이유: ${reason}`)] : [])].join("\n") });
const data = [won(3, "가격", 1_000_000), won(5, "가격", 2_000_000), won(8, "포트폴리오", 4_000_000), won(40, "추천·재계약", 3_000_000), won(10, null, 500_000), mk({ stage: "discovery" }), mk({ failed: true, consult: line(day(2), "(메모) 성사 이유: 가격") })];
const all = w.wonReasonBreakdown(data, NOW, null);
const row = (r, k) => r.rows.find((x) => x.reason === k);
ok("전체 기간: 계약 5건 · 가격 2건(3,000,000원)", all.total === 5 && row(all, "가격").count === 2 && row(all, "가격").amount === 3_000_000, JSON.stringify(row(all, "가격")));
ok("이유 없는 계약은 none", row(all, "none").count === 1 && row(all, "none").amount === 500_000);
ok("계약이 아닌 단계·종료된 건은 빠짐", all.rows.reduce((a, r) => a + r.count, 0) === 5);
const d30 = w.wonReasonBreakdown(data, NOW, 30);
ok("최근 30일: 40일 전 계약(추천·재계약)은 빠짐", d30.total === 4 && row(d30, "추천·재계약").count === 0 && row(d30, "가격").count === 2);
const d7 = w.wonReasonBreakdown(data, NOW, 7);
ok("최근 7일: 가격 2건만", d7.total === 2 && row(d7, "가격").count === 2 && row(d7, "포트폴리오").count === 0);
ok("모든 이유 줄이 항상 있음(5가지 + none)", all.rows.length === 6);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
