const { load } = require("../support/run.cjs");
const { parseInquirySheet, recordToCustomer } = load("lead-sheet");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const H = "날짜,상호명,연락처,이메일,단계,서비스 구분,유입 경로,예산,문의,문의 종류,담당자,가능성,최근 연락일,리터치 일정,1차 상담 내용,다음 액션 플랜,계약 금액,메모";
const row = (name, ph, stage, amount) => `2026-11-01 10:00,${name},${ph},,${stage},영상 제작,홈페이지,,,,,,,,,,${amount},`;
const csv = [H,
  row("금액만", "010-1111-0001", "", "₩1,500,000"),
  row("상담에금액", "010-1111-0002", "상담", "₩2,000,000"),
  row("실패에금액", "010-1111-0003", "실패/종료", "₩3,000,000"),
  row("금액오류", "010-1111-0004", "", "#N/A"),
  row("금액영", "010-1111-0005", "", "₩0"),
  row("금액숫자만", "010-1111-0006", "", "1500000"),
  row("아무것도없음", "010-1111-0007", "", ""),
  row("계약단계", "010-1111-0008", "계약", ""),
].join("\n");
const r = parseInquirySheet(csv);
if (!r.ok) { console.log("파싱 실패", r.error); process.exit(1); }
const by = Object.fromEntries(r.records.map((x) => [x.company, recordToCustomer(x, "2026-11-10T00:00:00.000Z")]));
ok("단계 비고 계약 금액 있음 → 계약", by["금액만"].stage === "won", by["금액만"].stage);
ok("숫자만 적어도(₩ 없이) → 계약", by["금액숫자만"].stage === "won");
ok("단계가 상담이면 상담 그대로(명시된 단계가 우선)", by["상담에금액"].stage === "discovery", by["상담에금액"].stage);
ok("실패/종료는 계약이 아님", by["실패에금액"].stage === "lead" && by["실패에금액"].tags.includes("실패/종료"));
ok("금액이 #N/A 오류면 리드", by["금액오류"].stage === "lead");
ok("금액이 0이면 리드", by["금액영"].stage === "lead");
ok("아무것도 없으면 리드", by["아무것도없음"].stage === "lead");
ok("단계가 계약이면 계약(금액 없어도)", by["계약단계"].stage === "won");
// 종료한 고객이 다시 문의하면 되살아난다
{
  const row2 = (date, name, ph, stage) => `${date},${name},${ph},,${stage},영상 제작,홈페이지,,,,,,,,,,,`;
  const csv2 = [H,
    row2("2026-03-01 10:00", "종료만", "010-2222-0001", "실패/종료"),
    row2("2026-03-01 10:00", "종료후재문의", "010-2222-0002", "실패/종료"),
    row2("2026-11-10 09:00", "종료후재문의", "010-2222-0002", ""),
    row2("2026-11-10 09:00", "재문의가더옛날", "010-2222-0003", "실패/종료"),
    row2("2026-03-01 10:00", "재문의가더옛날", "010-2222-0003", ""),
    row2("2026-03-01 10:00", "종료후재문의_종료행둘", "010-2222-0004", "실패/종료"),
    row2("2026-05-01 10:00", "종료후재문의_종료행둘", "010-2222-0004", "실패/종료"),
    row2("2026-11-10 09:00", "종료후재문의_종료행둘", "010-2222-0004", ""),
  ].join(String.fromCharCode(10));
  const rr = parseInquirySheet(csv2);
  const c2 = Object.fromEntries(rr.records.map((x) => [x.company, recordToCustomer(x, "2026-11-15T00:00:00.000Z")]));
  ok("종료만 있는 고객은 종료 그대로", c2["종료만"].tags.includes("실패/종료") && !c2["종료만"].tags.includes("종료 후 재문의"));
  ok("종료 뒤에 재문의가 오면 되살아남(종료 태그 없음 · '종료 후 재문의' 태그)", !c2["종료후재문의"].tags.includes("실패/종료") && c2["종료후재문의"].tags.includes("종료 후 재문의"), JSON.stringify(c2["종료후재문의"].tags));
  ok("종료 행이 더 최근이면 계속 종료", c2["재문의가더옛날"].tags.includes("실패/종료") && !c2["재문의가더옛날"].tags.includes("종료 후 재문의"));
  ok("종료 행이 여러 개여도 가장 최근 문의가 더 늦으면 되살아남", !c2["종료후재문의_종료행둘"].tags.includes("실패/종료") && c2["종료후재문의_종료행둘"].tags.includes("종료 후 재문의"));
}
console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
