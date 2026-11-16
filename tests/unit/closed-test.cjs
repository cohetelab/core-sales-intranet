const { load } = require("../support/run.cjs");
const k = load("lead-closed");
const rep = load("lead-report");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

// 사유 읽기
ok("마지막 줄의 사유를 읽음", k.closeReasonOf("[11.10 10:00 Ian] (전화) 통화\n[11.12 09:00 Ian] (메모) 종료 사유: 무응답") === "무응답");
ok("사유가 여러 번이면 가장 최근 것", k.closeReasonOf("[11.10 10:00 Ian] (메모) 종료 사유: 가격\n[11.12 09:00 Ian] (메모) 종료 사유: 시기") === "시기");
ok("사유 줄이 없으면 null", k.closeReasonOf("[11.10 10:00 Ian] (전화) 통화") === null && k.closeReasonOf("") === null && k.closeReasonOf(undefined) === null);
ok("모르는 사유 값은 무시(null)", k.closeReasonOf("[11.10 10:00 Ian] (메모) 종료 사유: 아무거나") === null);
ok("직접 적은 옛 내용 + 사유 줄", k.closeReasonOf("3/20 전화함\n[11.12 09:00 Connor] (메모) 종료 사유: 경쟁사") === "경쟁사");
ok("유형 없이 적힌 사유도 읽음", k.closeReasonOf("[11.12 09:00 Connor] 종료 사유: 기타") === "기타");
ok("사유 줄 뒤에 다른 기록이 와도 읽음", k.closeReasonOf("[11.12 09:00 Ian] (메모) 종료 사유: 가격\n[11.13 10:00 Ian] (전화) 다시 연락") === "가격");

// 집계
const NOW = Date.parse("2026-11-15T12:00:00+09:00");
const D = 86400000;
const ago = (days) => new Date(NOW - days * D).toISOString();
let n = 0;
const mk = (o) => ({ id: `c${++n}`, company: `c${n}`, stage: "lead", tags: ["문의DB", "홈페이지"], category: "숏폼", activities: [], createdAt: ago(10), ...o });
const closed = (o) => mk({ tags: ["문의DB", "홈페이지", "실패/종료"], ...o });
const consult = { c1: "[11.10 10:00 I] (메모) 종료 사유: 무응답", c2: "[11.10 10:00 I] (메모) 종료 사유: 무응답", c3: "[11.10 10:00 I] (메모) 종료 사유: 가격", c4: "[11.10 10:00 I] (메모) 종료 사유: 경쟁사" };
const list = [
  closed({ id: "c1" }), closed({ id: "c2" }), closed({ id: "c3" }),
  closed({ id: "c4", tags: ["문의DB", "META", "실패/종료"], category: "퍼포먼스" }),
  closed({ id: "c5" }), // 사유 없음
  mk({ id: "c6" }), mk({ id: "c7", tags: ["문의DB", "META"], category: "퍼포먼스" }), // 진행 중
  closed({ id: "c8", createdAt: ago(100) }), // 기간 밖
];
const co = (id) => consult[id];
const ch = k.closedReasonBreakdown(list, co, NOW, 30, (c) => [rep.channelOf(c)]);
const hp = ch.find((r) => r.key === "홈페이지"), me = ch.find((r) => r.key === "META");
ok("채널 홈페이지: 문의 5 · 종료 4 · 무응답 2 · 가격 1 · 사유 없음 1", hp.inquiries === 5 && hp.closed === 4 && hp.byReason.무응답 === 2 && hp.byReason.가격 === 1 && hp.byReason.none === 1, JSON.stringify(hp));
ok("채널 META: 문의 2 · 종료 1 · 경쟁사 1", me.inquiries === 2 && me.closed === 1 && me.byReason.경쟁사 === 1);
ok("종료율 = 종료/문의", Math.abs(hp.rate - 4 / 5) < 1e-9 && Math.abs(me.rate - 0.5) < 1e-9);
ok("정렬: 종료가 많은 채널 먼저", ch[0].key === "홈페이지");
ok("기간 밖(100일 전) 종료는 30일 집계에서 제외", !ch.some((r) => r.inquiries === 6));
const all = k.closedReasonBreakdown(list, co, NOW, null, (c) => [rep.channelOf(c)]);
ok("전체 기간에는 100일 전 종료도 포함(홈페이지 문의 6 · 종료 5 · 사유 없음 2)", all.find((r) => r.key === "홈페이지").inquiries === 6 && all.find((r) => r.key === "홈페이지").closed === 5 && all.find((r) => r.key === "홈페이지").byReason.none === 2);
const sv = k.closedReasonBreakdown(list, co, NOW, 30, rep.servicesOf);
ok("서비스: 숏폼 종료 4(무응답 2·가격 1·없음 1) · 퍼포먼스 종료 1", sv.find((r) => r.key === "숏폼").closed === 4 && sv.find((r) => r.key === "퍼포먼스").closed === 1);
const tot = k.closedTotals(list, co, NOW, 30);
ok("합계: 문의 7 · 종료 5 · 무응답 2 · 가격 1 · 경쟁사 1 · 사유 없음 1", tot.inquiries === 7 && tot.closed === 5 && tot.byReason.무응답 === 2 && tot.byReason.가격 === 1 && tot.byReason.경쟁사 === 1 && tot.byReason.none === 1, JSON.stringify(tot));
ok("진행 중 고객은 사유 칸에 들어가지 않음(사유 합 = 종료 수)", Object.values(tot.byReason).reduce((a, b) => a + b, 0) === tot.closed);
ok("빈 목록(안 터짐)", k.closedReasonBreakdown([], co, NOW, 30, () => ["x"]).length === 0 && k.closedTotals([], co, NOW, 30).closed === 0);
ok("사유 칸 6개(5사유 + 사유 없음)", k.REASON_KEYS.length === 6);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
