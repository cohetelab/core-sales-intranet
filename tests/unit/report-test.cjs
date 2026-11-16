const { load } = require("../support/run.cjs");
const r = load("lead-report");
let fail = 0;
const ok = (n, cond, x = "") => { console.log(`${cond ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!cond) fail++; };

const NOW = Date.parse("2026-11-10T12:00:00+09:00");
const iso = (s) => new Date(Date.parse(`${s}+09:00`)).toISOString();
let n = 0;
const mk = (o) => ({ id: `c${++n}`, stage: "lead", tags: ["문의DB", "홈페이지"], category: "숏폼", activities: [], createdAt: iso("2026-11-01T10:00:00"), ...o });
const consult = { type: "note", summary: "1차 상담 내용", detail: "[11.02 10:00 Ian] x" };

// 판정
ok("계약: 단계가 계약", r.isContracted(mk({ stage: "won" })));
ok("계약 판정은 단계만 본다(금액 태그만 있는 리드는 계약 아님 — 단계 보정은 시트를 읽을 때 끝남)", !r.isContracted(mk({ tags: ["문의DB", "홈페이지", "계약금액 ₩1,500,000"] })));
ok("계약 아님: 아무것도 없음", !r.isContracted(mk({})));
ok("실패/종료는 계약·상담이 아님", !r.isContracted(mk({ stage: "won", tags: ["실패/종료"] })) && !r.isEngaged(mk({ stage: "proposal", tags: ["실패/종료"] })));
ok("상담: 단계가 리드가 아님 / 상담 내용 있음 / 계약", r.isEngaged(mk({ stage: "discovery" })) && r.isEngaged(mk({ activities: [consult] })) && r.isEngaged(mk({ stage: "won" })));
ok("상담 아님: 메모만 있는 경우", !r.isEngaged(mk({ activities: [{ type: "note", summary: "메모", detail: "x" }] })));
ok("계약 금액 태그 ₩0 같은 값은 계약 금액 없음으로 취급", !r.isContracted(mk({ tags: ["문의DB", "홈페이지", "계약금액 ₩0"] })));

// 분류
ok("채널: 태그에서", r.channelOf(mk({ tags: ["문의DB", "META"] })) === "META" && r.channelOf(mk({ tags: ["문의DB"] })) === "기타");
ok("서비스: 여러 개 / 없으면 미분류", r.servicesOf(mk({ category: "숏폼 · 인플루언서" })).join() === "숏폼,인플루언서" && r.servicesOf(mk({ category: "미분류" })).join() === "미분류");
ok("월: 한국 시간 기준(10/31 23:30 KST → 10월)", r.monthOf(mk({ createdAt: iso("2026-10-31T23:30:00") })) === "2026-10" && r.monthOf(mk({ createdAt: iso("2026-11-01T00:30:00") })) === "2026-11");

// 기간
const aged = [mk({ createdAt: iso("2026-11-09T10:00:00") }), mk({ createdAt: iso("2026-09-01T10:00:00") }), mk({ tags: ["실패/종료"] })];
ok("기간: 최근 30일 → 1건(오래된 것·실패 제외)", r.inWindow(aged, NOW, 30).length === 1);
ok("기간: 전체 → 실패만 제외 2건", r.inWindow(aged, NOW, null).length === 2);

// 퍼널
const data = [
  mk({ tags: ["문의DB", "홈페이지"], category: "숏폼" }),
  mk({ tags: ["문의DB", "홈페이지"], category: "숏폼", activities: [consult] }),
  mk({ stage: "won", tags: ["문의DB", "홈페이지", "계약금액 ₩2,000,000"], category: "숏폼 · 인플루언서" }),
  mk({ tags: ["문의DB", "META"], category: "퍼포먼스", stage: "won" }),
  mk({ tags: ["문의DB", "META"], category: "퍼포먼스" }),
];
const byCh = r.funnelBy(data, (c) => [r.channelOf(c)]);
const hp = byCh.find((x) => x.key === "홈페이지"), me = byCh.find((x) => x.key === "META");
ok("채널 정렬: 문의 많은 순(홈페이지 먼저)", byCh[0].key === "홈페이지");
ok("홈페이지: 문의 3 · 상담 2 · 계약 1 · 금액 200만 · 전환율 1/3", hp.inquiries === 3 && hp.engaged === 2 && hp.contracted === 1 && hp.amount === 2000000 && Math.abs(hp.rate - 1 / 3) < 1e-9, JSON.stringify(hp));
ok("META: 문의 2 · 상담 1 · 계약 1(금액 없음 → 0원)", me.inquiries === 2 && me.engaged === 1 && me.contracted === 1 && me.amount === 0, JSON.stringify(me));
const bySv = r.funnelBy(data, r.servicesOf);
ok("서비스: 여러 서비스는 각각에 센다(숏폼 3, 인플루언서 1, 퍼포먼스 2)", bySv.find((x) => x.key === "숏폼").inquiries === 3 && bySv.find((x) => x.key === "인플루언서").inquiries === 1 && bySv.find((x) => x.key === "퍼포먼스").inquiries === 2, JSON.stringify(bySv.map((x) => [x.key, x.inquiries])));
ok("빈 목록이면 빈 결과(안 터짐)", r.funnelBy([], (c) => [r.channelOf(c)]).length === 0 && r.monthly([]).length === 0 && r.totals([]).inquiries === 0);

// 월별
const mm = r.monthly([mk({ createdAt: iso("2026-10-05T10:00:00") }), mk({ createdAt: iso("2026-11-05T10:00:00"), stage: "won", tags: ["문의DB", "META", "계약금액 ₩1"] }), mk({ createdAt: iso("2026-11-06T10:00:00") })]);
ok("월별: 최신 월 먼저, 11월 2건(META 1·홈페이지 1)·계약 1", mm[0].month === "2026-11" && mm[0].inquiries === 2 && mm[0].contracted === 1 && mm[0].byChannel.META === 1 && mm[0].byChannel.홈페이지 === 1 && mm[1].month === "2026-10", JSON.stringify(mm[0]));

// 합계
const t = r.totals(data);
ok("합계: 문의 5 · 상담 3 · 계약 2 · 금액 200만 · 금액 기재 1", t.inquiries === 5 && t.engaged === 3 && t.contracted === 2 && t.amount === 2000000 && t.withAmount === 1, JSON.stringify(t));

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
