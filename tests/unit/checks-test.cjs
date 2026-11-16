const { load } = require("../support/run.cjs");
const c = load("lead-checks");
let fail = 0;
const ok = (n, cond, x = "") => { console.log(`${cond ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!cond) fail++; };

const NOW = Date.parse("2026-11-10T12:00:00+09:00");
const TODAY = "2026-11-10";
const h = (hours) => new Date(NOW - hours * 3600000).toISOString();
const mk = (o) => ({ id: "x", company: "x", stage: "lead", owner: "미배정", tags: [], activities: [], createdAt: h(1), lastActivityAt: h(1), nextStep: "담당자 배정 필요", ...o });
const m = (id, cust) => c.matchesCheck(id, cust, NOW, TODAY);

// 24시간 넘게 미배정
ok("미배정 23시간 → 아님", !m("unassigned", mk({ createdAt: h(23) })));
ok("미배정 25시간 → 해당", m("unassigned", mk({ createdAt: h(25) })));
ok("배정됐으면 미배정 점검 제외", !m("unassigned", mk({ createdAt: h(25), owner: "이익재(Ian)" })));
ok("상담 단계는 미배정 점검 제외", !m("unassigned", mk({ createdAt: h(25), stage: "discovery" })));
ok("실패/종료는 모든 점검 제외", c.CHECKS.every(({ id }) => !m(id, mk({ createdAt: h(999), lastActivityAt: h(9999), tags: ["실패/종료"], stage: id === "noAmount" ? "won" : "lead" }))));

// 첫 컨택 기록 없음
const assigned = { owner: "이익재(Ian)", nextStep: "첫 컨택 필요", createdAt: h(30) };
ok("배정+기록 없음+30시간 → 해당", m("noContact", mk(assigned)));
ok("다음 액션을 적었으면 제외", !m("noContact", mk({ ...assigned, nextStep: "견적 발송" })));
ok("상담 메모가 있으면 제외", !m("noContact", mk({ ...assigned, activities: [{ type: "note" }] })));
ok("문의 접수(system)만 있으면 해당", m("noContact", mk({ ...assigned, activities: [{ type: "system" }] })));
ok("12시간이면 아직 제외", !m("noContact", mk({ ...assigned, createdAt: h(12) })));
ok("30일 넘게 지난 미배정은 점검에서 제외(정리 대기함이 맡음)", !m("unassigned", mk({ createdAt: h(31 * 24) })) && m("unassigned", mk({ createdAt: h(29 * 24) })));
ok("30일 넘게 지난 첫 컨택 없음도 제외", !m("noContact", mk({ ...assigned, createdAt: h(31 * 24) })) && m("noContact", mk({ ...assigned, createdAt: h(29 * 24) })));

// 리터치 지남
const day = (d) => new Date(Date.parse(`${d}T12:00:00+09:00`)).toISOString();
ok("어제 일정(상담) → 지남", m("overdue", mk({ stage: "discovery", nextStepDue: day("2026-11-09") })));
ok("오늘 일정 → 아직", !m("overdue", mk({ stage: "discovery", nextStepDue: day("2026-11-10") })));
ok("일정 없음 → 제외", !m("overdue", mk({ stage: "discovery" })));
ok("계약 고객은 제외", !m("overdue", mk({ stage: "won", nextStepDue: day("2026-11-01") })));

// 활동 없음
ok("제안 단계 15일 무활동 → 해당", m("stale", mk({ stage: "proposal", lastActivityAt: h(15 * 24) })));
ok("제안 단계 13일 → 제외", !m("stale", mk({ stage: "proposal", lastActivityAt: h(13 * 24) })));
ok("리드 단계는 제외", !m("stale", mk({ stage: "lead", lastActivityAt: h(30 * 24) })));

// 계약 금액
ok("계약+금액 없음 → 해당", m("noAmount", mk({ stage: "won" })));
ok("계약+금액 있음 → 제외", !m("noAmount", mk({ stage: "won", tags: ["계약금액 ₩1,500,000"] })));
ok("리드는 제외", !m("noAmount", mk({})));

// 합계·부하
const list = [mk({ createdAt: h(30) }), mk({ createdAt: h(40) }), mk({ owner: "이익재(Ian)", stage: "discovery" }), mk({ owner: "김세현(Connor)" }), mk({ owner: "이익재(Ian)", stage: "won" }), mk({ owner: "이익재(Ian)", tags: ["실패/종료"] })];
const r = c.runChecks(list, NOW, TODAY);
ok("runChecks 미배정 2", r.unassigned === 2, JSON.stringify(r));
const l = c.loadByOwner(list);
ok("loadByOwner: Ian 1(상담만), Connor 1, 계약·실패·미배정 제외", l["이익재(Ian)"] === 1 && l["김세현(Connor)"] === 1 && Object.keys(l).length === 2, JSON.stringify(l));
ok("잘못된 날짜 문자열은 해당 없음(터지지 않음)", !m("unassigned", mk({ createdAt: "이상한값" })));

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
