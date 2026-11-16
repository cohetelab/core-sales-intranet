const { load } = require("../support/run.cjs");
const d = load("lead-digest");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const NOW = Date.parse("2026-11-17T09:00:00+09:00"); // 화요일
const D = 86400000;
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const day = (dd) => new Date(Date.parse(`${dd}T12:00:00+09:00`)).toISOString();
let n = 0;
const mk = (o) => ({ id: `c${++n}`, company: `업체${n}`, stage: "lead", owner: "미배정", tags: ["문의DB", "홈페이지"], activities: [], nextStep: "", createdAt: ago(5), lastActivityAt: ago(5), ...o });
const IAN = "이익재(Ian)", CON = "김세현(Connor)";
const REPS = [IAN, CON];

// 기본 구성
const list = [
  mk({ owner: IAN, stage: "discovery", company: "아이언업체", nextStep: "견적 재발송", nextStepDue: day("2026-11-16") }), // 어제 → 지남
  mk({ owner: IAN, stage: "proposal", company: "오늘업체", nextStep: "계약서 전달", nextStepDue: day("2026-11-17") }),
  mk({ owner: IAN, stage: "proposal", company: "내일업체", nextStep: "통화", nextStepDue: day("2026-11-18") }),
  mk({ owner: IAN, stage: "discovery", company: "넷째업체", nextStep: "미팅", nextStepDue: day("2026-11-18") }),
  mk({ owner: CON, createdAt: ago(48), nextStep: "첫 컨택 필요" }), // 첫 컨택 기록 없음
  mk({ owner: "미배정", createdAt: ago(30) }), // 24시간 넘게 미배정
  mk({ owner: "미배정", createdAt: ago(100 * 24), lastActivityAt: ago(100 * 24) }), // 오래된 리드 → 정리 대기, 미배정 점검에서는 제외
];
const t = d.buildDigest(list, NOW, REPS, { appUrl: "https://example.vercel.app" });
console.log(t.split("\n").map((l) => "    " + l).join("\n"));
ok("제목에 한국 날짜·요일(11월 17일 화요일)", /\*오늘의 영업 알림\* · 11월 17일 화요일/.test(t));
ok("Ian: 일정 4건(지난 일정 1건)", /\*이익재\(Ian\)\* · 오늘·내일 일정 4건 \(지난 일정 1건\)/.test(t));
ok("Ian: 업체명·다음 액션 3개만(지난 일정이 맨 앞), 나머지는 '외 1건'", /• 아이언업체 — 견적 재발송 \(11\.16 지남\)/.test(t) && /• 오늘업체 — 계약서 전달 \(오늘\)/.test(t) && /• 내일업체 — 통화 \(내일\)/.test(t) && !t.includes("넷째업체") && /• 외 1건/.test(t));
ok("Connor: 첫 컨택 기록 없음 1건", /\*김세현\(Connor\)\* · 첫 컨택 기록 없음 1건/.test(t));
ok("팀: 24시간 넘게 미배정 1건(오래된 리드는 제외) · 정리 대기 1건", /\*팀\* · 24시간 넘게 미배정 1건 · 정리 대기 1건\(30일 이상\)/.test(t), (t.match(/\*팀\*.*/) || [""])[0]);
ok("맨 아래 인트라넷 링크", t.endsWith("<https://example.vercel.app|인트라넷 열기>"));

// 특수문자 이스케이프
const evil = [mk({ owner: IAN, company: "<!channel> 위험 & 업체", nextStep: "<@U123> 연락", nextStepDue: day("2026-11-17") })];
const te = d.buildDigest(evil, NOW, [IAN]);
ok("업체명의 <!channel> 은 &lt;!channel&gt; 로 바뀜(전체 알림 방지)", te.includes("&lt;!channel&gt; 위험 &amp; 업체") && !te.includes("<!channel>"));
ok("다음 액션의 <@U123> 도 이스케이프", te.includes("&lt;@U123&gt; 연락") && !te.includes("<@U123>"));
ok("이스케이프는 &, <, > 만", d.escapeSlack("a&b<c>d*e_f`g~h") === "a&amp;b&lt;c&gt;d*e_f`g~h");

// 이름 숨기기
const th = d.buildDigest(list, NOW, REPS, { hideNames: true });
ok("hideNames: 건수만 나가고 업체명·다음 액션은 없음", !th.includes("아이언업체") && !th.includes("견적 재발송") && /오늘·내일 일정 4건/.test(th));

// 비어 있을 때
const te2 = d.buildDigest([], NOW, REPS);
ok("고객이 없어도 만들어짐('확인할 항목이 없습니다')", /\*이익재\(Ian\)\* · 확인할 항목이 없습니다/.test(te2) && /\*팀\* · 확인할 항목이 없습니다/.test(te2) && !te2.includes("<http"));
ok("종료·계약 고객의 일정은 알림에 없음", !d.buildDigest([mk({ owner: IAN, tags: ["문의DB", "실패/종료"], nextStepDue: day("2026-11-16"), company: "종료업체" }), mk({ owner: IAN, stage: "won", nextStepDue: day("2026-11-16"), company: "계약업체" })], NOW, [IAN]).includes("업체"));
ok("글이 3000자 안쪽(긴 목록도 건수로 줄임)", d.buildDigest(Array.from({ length: 400 }, (_, i) => mk({ owner: IAN, stage: "discovery", company: `긴이름업체${i}`, nextStep: "다음 액션", nextStepDue: day("2026-11-16") })), NOW, REPS).length < 3000);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
