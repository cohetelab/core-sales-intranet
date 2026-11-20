const { load } = require("../support/run.cjs");
const h = load("lead-history");
const f = load("lead-fields");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

// 기본: 유형 있음/없음
let r = h.parseHistory("[11.06 14:30 Ian] (전화) 단가 문의\n[11.07 10:05 Connor] 견적 발송");
ok("기록 2건 · 차수 1·2", r.entries.length === 2 && r.entries[0].n === 1 && r.entries[1].n === 2);
ok("1건: 시각·작성자·유형·내용", JSON.stringify(r.entries[0]) === JSON.stringify({ i: 0, n: 1, auto: false, month: "11", day: "06", time: "14:30", author: "Ian", type: "전화", text: "단가 문의" }), JSON.stringify(r.entries[0]));
ok("2건: 유형 없음(null)", r.entries[1].type === null && r.entries[1].text === "견적 발송" && r.entries[1].author === "Connor");
ok("직접 적은 내용 없음", r.legacy === "");

// 여러 줄 기록
r = h.parseHistory("[11.06 14:30 Ian] (미팅) 안건\n1. 예산 확인\n2. 일정 조율\n\n[11.07 09:00 Ian] 후속");
ok("여러 줄은 한 기록으로 묶임(2건)", r.entries.length === 2, String(r.entries.length));
ok("여러 줄 내용 보존(줄바꿈 유지, 끝 공백 제거)", r.entries[0].text === "안건\n1. 예산 확인\n2. 일정 조율", JSON.stringify(r.entries[0].text));

// 시각 표시 이전에 직접 적은 내용
r = h.parseHistory("3/20 통화함\n부재중 2회\n[11.06 14:30 Ian] 재통화");
ok("앞부분은 '직접 적은 내용'", r.legacy === "3/20 통화함\n부재중 2회" && r.entries.length === 1, JSON.stringify(r));
r = h.parseHistory("그냥 메모만 있음");
ok("기록 줄이 없으면 전부 직접 적은 내용 · 차수 0건", r.legacy === "그냥 메모만 있음" && r.entries.length === 0);

// 경계
ok("빈 값/undefined → 빈 결과(안 터짐)", h.parseHistory("").entries.length === 0 && h.parseHistory(undefined).legacy === "" && h.parseHistory("   \n  ").entries.length === 0);
r = h.parseHistory("[11.06 14:30 Ian]\r\n[11.07 10:00 Ian] (메모)본문 붙여쓰기");
ok("CRLF·내용이 빈 기록·유형 뒤 공백 없음", r.entries.length === 2 && r.entries[0].text === "" && r.entries[1].type === "메모" && r.entries[1].text === "본문 붙여쓰기", JSON.stringify(r.entries));
r = h.parseHistory("[11.06 14:30 Ian] (팩스) 모르는 유형");
ok("모르는 유형은 내용으로 남김", r.entries[0].type === null && r.entries[0].text === "(팩스) 모르는 유형");
r = h.parseHistory("[11.06 14:30 Ian] 내용에 [11.06 15:00 Bob] 가 중간에 있음");
ok("줄 중간의 대괄호는 새 기록이 아님", r.entries.length === 1);
r = h.parseHistory("[11.06 14:30 Ian K] 이름에 공백");
ok("작성자 이름에 공백 허용", r.entries[0].author === "Ian K");
r = h.parseHistory("  [11.06 14:30 Ian] 앞에 공백이 있으면 기록 줄이 아님");
ok("줄 앞 공백이 있으면 기록 줄이 아님(직접 적은 내용)", r.entries.length === 0 && r.legacy.includes("앞에 공백"));

// 쓰는 쪽 ↔ 읽는 쪽 왕복
const NOW = Date.parse("2026-11-06T14:30:00+09:00");
const line = f.typedNoteLine("김세현(Connor)", "통화함", "미팅", NOW);
ok("쓰는 줄 형식", line === "[11.06 14:30 Connor] (미팅) 통화함", line);
const back = h.parseHistory(line);
ok("쓴 줄을 읽으면 같은 값", back.entries.length === 1 && back.entries[0].author === "Connor" && back.entries[0].type === "미팅" && back.entries[0].text === "통화함" && back.entries[0].time === "14:30");
ok("유형이 없으면 접두 없이", f.typedNoteLine("Ian", "메모", null, NOW) === "[11.06 14:30 Ian] 메모");
ok("여러 줄 입력도 왕복", h.parseHistory(f.typedNoteLine("Ian", "a\nb", "전화", NOW)).entries[0].text === "a\nb");

// 한도
ok("상담 칸 한도 5000(배포된 시트 스크립트와 같음)", f.CONSULT_LIMIT === 5000);
ok("5000자는 통과 · 5001자는 거절", f.checkField("consult", "x".repeat(5000)).ok === true && f.checkField("consult", "x".repeat(5001)).ok === false);

// 단계를 옮길 때 자동으로 남기는 줄: 차수를 세지 않고, 응답 속도·첫 컨택 판정에서 빠진다
{
  const line = f.stageChangeLine("김세현(Connor)", "연락됨", "딜 (제안중)", Date.parse("2026-11-20T07:30:00Z")); // KST 16:30
  ok("단계 줄 형식", line === "[11.20 16:30 Connor] (단계) 연락됨 → 딜 (제안중)", line);
  ok("빈 단계는 리드로 적음", f.stageChangeLine("이익재(Ian)", "", "연락됨", 0).endsWith("(단계) 리드 → 연락됨") && f.stageChangeLine("이익재(Ian)", "실패/종료", "", 0).endsWith("실패/종료 → 리드"));
  const text = ["[11.06 14:30 Ian] (전화) 통화", line, "[11.21 09:00 Ian] (이메일) 제안서 발송"].join("\n");
  const x = h.parseHistory(text);
  ok("단계 줄은 auto, 연락 차수에는 안 들어감(1차 · 단계 · 2차)", x.entries.length === 3 && x.entries[1].auto === true && x.entries[1].n === 0 && x.entries[0].n === 1 && x.entries[2].n === 2 && x.entries[2].auto === false, JSON.stringify(x.entries.map((e) => [e.n, e.auto])));
  ok("단계 줄의 유형·내용", x.entries[1].type === "단계" && x.entries[1].text === "연락됨 → 딜 (제안중)");
  ok("고를 수 있는 유형에는 단계가 없음", !h.HISTORY_TYPES.includes("단계") && h.STAGE_TYPE === "단계");
  const { load: ld } = require("../support/run.cjs");
  const resp = ld("lead-response");
  const mk = (detail) => ({ createdAt: "2026-11-20T00:00:00.000Z", activities: [{ type: "note", summary: "1차 상담 내용", detail }] });
  const now = Date.parse("2026-11-21T00:00:00Z");
  ok("응답 속도: 단계 줄만 있으면 아직 기록 없음(null)", resp.firstResponseMs(mk(line), now) === null);
  ok("응답 속도: 단계 줄이 먼저여도 연락 기록 시각을 씀", resp.firstResponseMs(mk(`${line}\n[11.20 18:30 Ian] (전화) 통화`), now) === 9.5 * 3_600_000, String(resp.firstResponseMs(mk(`${line}\n[11.20 18:30 Ian] (전화) 통화`), now)));
  ok("첫 컨택 완료 버튼 판정: 단계 줄만 있으면 아직 기록 없음", resp.hasStampedNote(line) === false && resp.hasStampedNote(`${line}\n[11.20 18:30 Ian] (메모) x`) === true);
}

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
