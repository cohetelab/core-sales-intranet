const { load } = require("../support/run.cjs");
const k = load("lead-cleanup");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const NOW = Date.parse("2026-11-15T12:00:00+09:00");
const D = 86400000;
const ago = (days) => new Date(NOW - days * D).toISOString();
const day = (d) => new Date(Date.parse(`${d}T12:00:00+09:00`)).toISOString();
let n = 0;
const mk = (o) => ({ id: `c${++n}`, company: `c${n}`, stage: "lead", tags: [], activities: [], createdAt: ago(100), lastActivityAt: ago(100), ...o });

// 마지막 움직임
ok("움직임: 마지막 문의·연락일 기준 50일", k.idleDays(mk({ lastActivityAt: ago(50) }), NOW) === 50);
const withStamp = mk({ createdAt: ago(100), lastActivityAt: ago(100), activities: [{ type: "note", summary: "1차 상담 내용", detail: "[11.10 10:00 Ian] 통화" }] });
ok("상담 기록 시각도 움직임으로 셈(11/10 기록 → 5일)", k.idleDays(withStamp, NOW) === 5, String(k.idleDays(withStamp, NOW)));
ok("메모(상담 내용 아님)는 움직임이 아님", k.idleDays(mk({ lastActivityAt: ago(40), activities: [{ type: "note", summary: "메모", detail: "[11.10 10:00 Ian] x" }] }), NOW) === 40);

// 후보 판정
ok("30일 기준: 31일 지난 리드는 후보, 29일은 아님", k.isCleanupCandidate(mk({ lastActivityAt: ago(31) }), NOW, 30) && !k.isCleanupCandidate(mk({ lastActivityAt: ago(29) }), NOW, 30));
ok("상담·제안 단계도 후보", k.isCleanupCandidate(mk({ stage: "discovery", lastActivityAt: ago(40) }), NOW, 30) && k.isCleanupCandidate(mk({ stage: "proposal", lastActivityAt: ago(40) }), NOW, 30));
ok("계약은 후보가 아님", !k.isCleanupCandidate(mk({ stage: "won", lastActivityAt: ago(400) }), NOW, 30));
ok("이미 종료한 고객은 후보가 아님", !k.isCleanupCandidate(mk({ tags: ["실패/종료"], lastActivityAt: ago(400) }), NOW, 30));
ok("앞으로 리터치 일정이 있으면 후보가 아님(오늘·미래)", !k.isCleanupCandidate(mk({ lastActivityAt: ago(90), nextStepDue: day("2026-11-15") }), NOW, 30) && !k.isCleanupCandidate(mk({ lastActivityAt: ago(90), nextStepDue: day("2026-12-01") }), NOW, 30));
ok("지난 리터치 일정은 보호하지 않음(어제 일정 → 후보)", k.isCleanupCandidate(mk({ lastActivityAt: ago(90), nextStepDue: day("2026-11-14") }), NOW, 30));
ok("상담 기록이 최근이면 후보가 아님", !k.isCleanupCandidate(withStamp, NOW, 30));

// 목록·건수
const list = [mk({ id: "a", lastActivityAt: ago(40) }), mk({ id: "b", lastActivityAt: ago(200) }), mk({ id: "c", lastActivityAt: ago(70) }), mk({ id: "d", lastActivityAt: ago(5) }), mk({ id: "e", stage: "won", lastActivityAt: ago(500) })];
ok("후보 목록은 가장 오래된 순(b → c → a), 최근·계약 제외", k.cleanupCandidates(list, NOW, 30).map((c) => c.id).join() === "b,c,a");
const cnt = k.cleanupCounts(list, NOW);
ok("기준별 건수: 14일 3 · 30일 3 · 60일 2 · 90일 1 · 180일 1", cnt[14] === 3 && cnt[30] === 3 && cnt[60] === 2 && cnt[90] === 1 && cnt[180] === 1, JSON.stringify(cnt));
ok("빈 목록(안 터짐)", k.cleanupCandidates([], NOW, 30).length === 0 && k.cleanupCounts([], NOW)[30] === 0);

// 사유
ok("종료 사유 5가지 · 기록 문구", k.CLOSE_REASONS.length === 5 && k.reasonNote("무응답") === "종료 사유: 무응답");
ok("기본 기준 30일 · 기준 칩 14/30/60/90/180", k.DEFAULT_CLEANUP_DAYS === 30 && k.CLEANUP_DAYS.join() === "14,30,60,90,180");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
