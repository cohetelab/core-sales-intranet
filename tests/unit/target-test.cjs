const { load } = require("../support/run.cjs");
const t = load("lead-target");
const w = load("workspace-config");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const NOW = Date.parse("2026-11-23T03:00:00Z"); // KST 2026-11-23 12:00
const ms = (kstIso) => Date.parse(`${kstIso}:00+09:00`);
const noteStamp = (at) => { const s = new Date(at + 9 * 3_600_000).toISOString(); return `[${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)} Ian]`; };
let n = 0;
const mk = (o = {}) => ({
  id: `lead-${++n}`, company: o.company ?? `고객${n}`, category: "숏폼", website: "-", stage: o.stage ?? "won", dealValueMonthly: 0, source: "inbound", owner: o.owner ?? "이익재(Ian)",
  manager: "", email: "", phone: "", createdAt: o.createdAt ?? "2026-10-01T01:00:00.000Z", lastActivityAt: o.lastActivityAt ?? o.createdAt ?? "2026-10-01T01:00:00.000Z", contacts: [],
  activities: o.consult ? [{ type: "note", summary: "1차 상담 내용", detail: o.consult, at: "2026-11-01T00:00:00.000Z" }] : [], tags: o.tags ?? ["문의DB", "홈페이지", ...(o.amount ? [`계약금액 ₩${o.amount.toLocaleString("en-US")}`] : [])], operationStatus: "not_started",
});
const toWon = (at) => `${noteStamp(at)} (단계) 연락됨 → 성사`;

// 계약 시점: '성사' 단계 줄이 있으면 그 시각(정확), 없으면 마지막 활동(추정)
const exact = mk({ consult: toWon(ms("2026-11-10T14:30")) });
const guess = mk({ lastActivityAt: "2026-11-05T01:00:00.000Z" });
ok("성사 줄이 있으면 그 시각이 계약 시점(정확)", t.contractedAt(exact, NOW).exact === true && t.monthKey(t.contractedAt(exact, NOW).at) === "2026-11");
ok("성사 줄이 없으면 마지막 활동으로 추정", t.contractedAt(guess, NOW).exact === false && t.monthKey(t.contractedAt(guess, NOW).at) === "2026-11");
const twice = mk({ consult: [toWon(ms("2026-10-05T10:00")), `${noteStamp(ms("2026-10-20T10:00"))} (단계) 성사 → 리드`, toWon(ms("2026-11-12T10:00"))].join("\n") });
ok("성사를 여러 번 거쳤으면 가장 최근 성사 줄", t.monthKey(t.contractedAt(twice, NOW).at) === "2026-11");
const notWon = mk({ consult: `${noteStamp(ms("2026-11-10T14:30"))} (단계) 리드 → 연락됨`, lastActivityAt: "2026-09-01T01:00:00.000Z" });
ok("성사가 아닌 단계 줄은 계약 시점이 아님(마지막 활동으로 추정)", t.contractedAt(notWon, NOW).exact === false && t.monthKey(t.contractedAt(notWon, NOW).at) === "2026-09");
ok("사람이 직접 적은 '→ 성사' 메모는 단계 줄이 아니라 무시", t.contractedAt(mk({ consult: `${noteStamp(ms("2026-11-10T14:30"))} (메모) 거의 성사 → 성사`, lastActivityAt: "2026-08-01T01:00:00.000Z" }), NOW).exact === false);

// 월별 · 담당자별 집계
const data = [
  mk({ company: "A", owner: "이익재(Ian)", amount: 3_000_000, consult: toWon(ms("2026-11-10T14:30")) }),
  mk({ company: "B", owner: "이익재(Ian)", amount: 2_000_000, lastActivityAt: "2026-11-05T01:00:00.000Z" }), // 추정
  mk({ company: "C", owner: "김세현(Connor)", consult: toWon(ms("2026-11-11T09:00")) }), // 금액 없음
  mk({ company: "D", owner: "이익재(Ian)", amount: 8_000_000, consult: toWon(ms("2026-10-15T12:00")), createdAt: "2026-10-01T01:00:00.000Z" }), // 지난달
  mk({ company: "E", owner: "미배정", amount: 1_000_000, consult: toWon(ms("2026-11-12T09:00")) }),
  mk({ company: "F", owner: "김유진(Luna)", amount: 4_000_000, consult: toWon(ms("2026-11-13T09:00")) }), // 퇴사자
  mk({ company: "G", owner: "이익재(Ian)", stage: "discovery", amount: 9_000_000 }), // 계약 아님
  mk({ company: "H", owner: "이익재(Ian)", amount: 7_000_000, tags: ["문의DB", "홈페이지", "실패/종료", "계약금액 ₩7,000,000"], consult: toWon(ms("2026-11-14T09:00")) }), // 종료된 건
];
const nov = t.contractsByOwner(data, "2026-11", NOW);
const row = (rows, o) => rows.find((r) => r.owner === o);
ok("이번 달 Ian: 5,000,000원 · 2건 · 추정 1건", row(nov, "이익재(Ian)").amount === 5_000_000 && row(nov, "이익재(Ian)").count === 2 && row(nov, "이익재(Ian)").estimated === 1, JSON.stringify(row(nov, "이익재(Ian)")));
ok("이번 달 Connor: 금액 없는 계약 1건(0원, 금액 미기재 1)", row(nov, "김세현(Connor)").count === 1 && row(nov, "김세현(Connor)").amount === 0 && row(nov, "김세현(Connor)").noAmount === 1);
ok("미배정·퇴사 담당의 계약은 '기타'로 묶임(1,000,000 + 4,000,000)", row(nov, t.OTHER_OWNER).amount === 5_000_000 && row(nov, t.OTHER_OWNER).count === 2);
ok("계약이 아닌 단계·종료된 건은 집계에서 빠짐", nov.reduce((a, r) => a + r.count, 0) === 5);
const oct = t.contractsByOwner(data, "2026-10", NOW);
ok("지난달 Ian: 8,000,000원 · 1건", row(oct, "이익재(Ian)").amount === 8_000_000 && row(oct, "이익재(Ian)").count === 1);
ok("등록된 영업은 계약이 없어도 줄이 있음(Connor 지난달 0건) · 기타 줄은 없음", row(oct, "김세현(Connor)").count === 0 && !row(oct, t.OTHER_OWNER));

// 달성률
ok("달성률: 500만 / 1000만 = 50% · 500만 남음", JSON.stringify(t.attainment(5_000_000, 10_000_000)) === JSON.stringify({ pct: 50, remaining: 5_000_000, reached: false }));
ok("달성률: 목표 초과 → 100% 넘게 · 달성 · 남은 금액 0", t.attainment(12_000_000, 10_000_000).pct === 120 && t.attainment(12_000_000, 10_000_000).reached === true && t.attainment(12_000_000, 10_000_000).remaining === 0);
ok("달성률: 소수 첫째 자리까지(1/3 → 33.3%)", t.attainment(1_000_000, 3_000_000).pct === 33.3);
ok("달성률: 목표가 없거나 0이면 null", t.attainment(5, undefined).pct === null && t.attainment(5, 0).pct === null);
ok("달성률: 금액 0 · 목표 있음 → 0%", t.attainment(0, 10_000_000).pct === 0);

// 월 키
ok("최근 6개월(이번 달 포함, 최근이 앞)", t.recentMonths(NOW, 6).join() === "2026-11,2026-10,2026-09,2026-08,2026-07,2026-06");
ok("연초에는 작년으로 넘어감", t.recentMonths(Date.parse("2026-01-15T03:00:00Z"), 3).join() === "2026-01,2025-12,2025-11");
ok("월 경계는 한국 시간: 10/31 15:30Z = KST 11/1 00:30", t.monthKey(Date.parse("2026-10-31T15:30:00Z")) === "2026-11" && t.monthKey(Date.parse("2026-10-31T14:30:00Z")) === "2026-10");
ok("금액 표기: 만원 단위", t.manwon(12_500_000) === "1,250만원" && t.manwon(9_000) === "9,000원" && t.won(5_000_000) === "5,000,000원");

// 목표 설정(팀 공용 설정에 저장)
const d = w.defaultConfig();
ok("기본: 목표 없음 · 월 목표 카드가 홈 카드 목록에 있음", Object.keys(d.targets).length === 0 && d.home.some((x) => x.id === "target"));
const c1 = w.setTarget(d, "이익재(Ian)", 10_000_000);
ok("목표 설정", c1.targets["이익재(Ian)"] === 10_000_000 && Object.keys(d.targets).length === 0);
ok("목표 지우기(null·0·음수·소수·상한 초과·문자)", [null, 0, -5, 1.5, w.MAX_TARGET + 1].every((v) => !("이익재(Ian)" in w.setTarget(c1, "이익재(Ian)", v).targets)));
ok("저장된 목표는 다시 읽어도 유지", w.normalizeConfig(JSON.parse(JSON.stringify(c1))).targets["이익재(Ian)"] === 10_000_000);
const bad = w.normalizeConfig({ version: 1, targets: { "이익재(Ian)": "천만", "김세현(Connor)": -3, "": 5, ["x".repeat(41)]: 5, ok: 7_000_000, 소수: 1.5, 큼: w.MAX_TARGET + 1 } });
ok("깨진 목표는 버리고 올바른 것만 남김", Object.keys(bad.targets).join() === "ok", JSON.stringify(bad.targets));
ok("목표 모양이 아예 틀려도(배열·문자) 빈 목표", Object.keys(w.normalizeConfig({ version: 1, targets: [1, 2] }).targets).length === 0 && Object.keys(w.normalizeConfig({ version: 1, targets: "x" }).targets).length === 0);
const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`영업${i}`, 1_000_000]));
ok("목표는 최대 20명까지", Object.keys(w.normalizeConfig({ version: 1, targets: many }).targets).length === 20);

// 관리자가 아닌 사람은 본인 월 목표만 바꿀 수 있다
{
  const base = w.setTarget(w.setTarget(w.defaultConfig(), "이익재(Ian)", 5_000_000), "김세현(Connor)", 8_000_000);
  const own = w.setTarget(base, "이익재(Ian)", 6_000_000);
  ok("본인 목표만 바꾸면 허용", w.isOwnTargetChange(base, own, "이익재(Ian)") === true);
  ok("본인 목표를 지워도 허용", w.isOwnTargetChange(base, w.setTarget(base, "이익재(Ian)", null), "이익재(Ian)") === true);
  ok("본인 목표를 처음 넣는 것도 허용", w.isOwnTargetChange(w.defaultConfig(), w.setTarget(w.defaultConfig(), "이익재(Ian)", 1_000_000), "이익재(Ian)") === true);
  ok("다른 사람의 목표를 바꾸면 거절", w.isOwnTargetChange(base, w.setTarget(base, "김세현(Connor)", 1_000_000), "이익재(Ian)") === false);
  ok("본인 목표와 함께 다른 사람 목표를 바꾸면 거절", w.isOwnTargetChange(base, w.setTarget(own, "김세현(Connor)", 1), "이익재(Ian)") === false);
  ok("홈 카드를 바꾸면 거절", w.isOwnTargetChange(base, w.toggleWidget(base, "status"), "이익재(Ian)") === false);
  ok("메뉴를 바꾸면 거절", w.isOwnTargetChange(base, w.toggleMenu(base, "/leads"), "이익재(Ian)") === false);
  ok("기준일을 바꾸면 거절", w.isOwnTargetChange(base, w.setLeadsSince(base, "2026-10-01"), "이익재(Ian)") === false);
  ok("본인 목표를 바꾸면서 홈 카드도 바꾸면 거절", w.isOwnTargetChange(base, w.toggleWidget(own, "status"), "이익재(Ian)") === false);
  ok("아무것도 안 바꿔도 허용(같은 설정)", w.isOwnTargetChange(base, base, "이익재(Ian)") === true);
}

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
