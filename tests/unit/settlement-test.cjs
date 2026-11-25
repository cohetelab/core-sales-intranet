const { load } = require("../support/run.cjs");
const s = load("settlement-parse");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

// 금액
ok("금액: ₩ · 쉼표 · 원", s.parseMoney("₩145,050") === 145050 && s.parseMoney("145050") === 145050 && s.parseMoney("145,050원") === 145050 && s.parseMoney(" ₩1,000 ") === 1000);
ok("금액: 음수(-·괄호)", s.parseMoney("-₩1,000") === -1000 && s.parseMoney("(1,000)") === -1000 && s.parseMoney("-1,000") === -1000);
ok("금액: 빈칸은 null, 글자·오류값은 NaN", s.parseMoney("") === null && s.parseMoney("   ") === null && Number.isNaN(s.parseMoney("#REF!")) && Number.isNaN(s.parseMoney("기타")) && Number.isNaN(s.parseMoney("N/A")));
ok("금액: 소수는 반올림", s.parseMoney("₩1,000.6") === 1001);
// 날짜
ok("날짜: 여러 표기", s.parseDate("2026-04-27") === "2026-04-27" && s.parseDate("2026.07.06 12:42") === "2026-07-06" && s.parseDate("2026. 4. 7.") === "2026-04-07" && s.parseDate("2026/4/7") === "2026-04-07");
ok("날짜: 읽을 수 없으면 빈 값", s.parseDate("") === "" && s.parseDate("내일") === "" && s.parseDate("2026-13-40") === "");
// 결제 상태
ok("상태: 결제 완료·대기·환불·빈칸·기타", s.payStatusOf("결제 완료") === "paid" && s.payStatusOf("결제 대기") === "waiting" && s.payStatusOf("환불") === "refund" && s.payStatusOf("") === "unset" && s.payStatusOf("확인중") === "other");

// 표: 맨 위 제목 행 + 헤더(끝에 빈 열) + 지저분한 데이터
const H = ["구분", "광고주", "프로젝트명", "인플루언서명", "인플루언서 비용", "공제 후 금액", "광고주 계약 매출", "업로드 여부", "업로드 URL", "결제 여부", "결제일", ""];
const R = (...c) => { const r = Array(12).fill(""); c.forEach((v, i) => (r[i] = v)); return r; };
const table = [
  ["2026년 정산표", ...Array(11).fill("")], // 제목 행(헤더가 첫 줄이 아니어도 찾는다)
  H,
  R("법인A", "광고주1", "프로젝트X", "가나다", "₩150,000", "₩145,050", "₩200,000", "O", "https://example.com/a", "결제 완료", "2026-04-27"), // 3행 정상
  R("법인A", "광고주1", "프로젝트X", "라마바", "", "96700", "₩200,000", "O", "", "결제 완료", "2026.04.27 10:00"), // 4행 공제 후만 있고 숫자 표기
  R("법인B", "광고주2", "프로젝트Y", "사아자", "₩100,000", "", "", "", "", "결제 대기", ""), // 5행 비용만 있음
  R("법인B", "광고주2", "프로젝트Y", "차카타", "₩50,000", "₩48,350", "#REF!", "O", "", "", ""), // 6행 결제 여부 빈칸 + 매출 오류값
  R("법인B", "광고주2", "프로젝트Y", "파하가", "₩70,000", "₩67,690", "₩90,000", "shoot_final.mp4", "", "결제 완료", ""), // 7행 업로드 칸에 파일명 + 결제일 없음
  Array(12).fill(""), // 8행 완전 빈 행
  R("", "", "", "", "₩1,000,000", "₩900,000", "₩2,000,000"), // 9행 합계 행(인플루언서명 없음)
  R("법인A", "광고주3", "프로젝트X", "나다라", "₩80,000", "₩77,360", "₩120,000", "O", "", "환불", "2026-05-02"), // 10행 환불
  R("법인A", "광고주3", "프로젝트X", "마바사", "", "", "₩30,000", "", "", "결제 대기", ""), // 11행 지급액 없음
  R("법인A", "광고주3", "프로젝트X", "아자차", "₩60,000", "기타", "", "", "", "확인중", "2026-06-01"), // 12행 공제 후 오류값 + 이상한 상태 + 결제일만 있음
  R("법인A", "광고주3", "프로젝트X", "카타파", "₩40,000", "₩38,680", "", "x", "", "결제 완료", "내일"), // 13행 결제일 읽을 수 없음
];
const r = s.parseSettlementSheet(table);
ok("헤더를 2번째 줄에서 찾음", r.ok && r.header.row === 2 && r.header.missing.length === 0, JSON.stringify(r.header));
ok("행 수: 빈 행·합계 행 제외 9행", r.rows.length === 9, String(r.rows.length));
ok("건너뛴 행: 빈 행 1 · 합계 행 1", r.skipped.blank === 1 && r.skipped.summary === 1, JSON.stringify(r.skipped));
const by = (name) => r.rows.find((x) => x.creator === name);
ok("정상 행: 금액·날짜·업로드·상태", by("가나다").cost === 150000 && by("가나다").after === 145050 && by("가나다").revenue === 200000 && by("가나다").uploaded === true && by("가나다").status === "paid" && by("가나다").paidAt === "2026-04-27" && by("가나다").row === 3);
ok("숫자로만 적힌 금액과 시각이 붙은 날짜도 읽음", by("라마바").after === 96700 && by("라마바").cost === null && by("라마바").paidAt === "2026-04-27");
ok("비용만 있는 행", by("사아자").cost === 100000 && by("사아자").after === null && by("사아자").status === "waiting");
ok("오류값(#REF!)은 0이 아니라 null", by("차카타").revenue === null);
ok("업로드 칸의 파일명은 업로드로 세지 않고 메모로 보관", by("파하가").uploaded === false && by("파하가").uploadNote === "shoot_final.mp4");
ok("결제 여부 빈칸은 unset", by("차카타").status === "unset" && by("차카타").statusText === "");
ok("합계 행(9행)은 목록에 없음", !r.rows.some((x) => x.row === 9));

// 지급액 규칙: 공제 후 → 없으면 비용 → 없으면 0
ok("지급액: 공제 후 우선 · 없으면 비용 · 둘 다 없으면 0", s.payoutOf(by("가나다")) === 145050 && s.payoutOf(by("사아자")) === 100000 && s.payoutOf(by("마바사")) === 0 && s.payoutOf(by("아자차")) === 60000);
// 합계
const t = s.totalsOf(r.rows);
// 지급액: 145050+96700+100000+48350+67690+(마바사 0)+(아자차 60000)+38680 = 556470 · 환불(77,360)은 제외
ok("총 지급액(환불 제외)", t.payout === 556470, String(t.payout));
ok("결제 완료: 가나다 145,050 + 라마바 96,700 + 파하가 67,690 + 카타파 38,680 = 348,120 (4건)", t.paid === 348120 && t.paidRows === 4, `${t.paid}/${t.paidRows}`);
ok("미결제: 총 지급액 − 결제 완료 = 208,350 (사아자·차카타·마바사·아자차 4건)", t.unpaid === 208350 && t.unpaidRows === 4, `${t.unpaid}/${t.unpaidRows}`);
ok("환불은 따로(77,360 · 1건)", t.refund === 77360 && t.refundRows === 1);
ok("계약 매출 합계(환불·오류값·빈칸 제외): 200,000+200,000+90,000+30,000 = 520,000", t.revenue === 520000 && t.revenueRows === 4, `${t.revenue}/${t.revenueRows}`);
ok("총 지급액 = 결제 완료 + 미결제", t.payout === t.paid + t.unpaid);

// 주의 목록
const W = Object.fromEntries(r.warnings.map((w) => [w.id, w]));
ok("주의: 숫자가 아닌 금액 칸(공제 후 1 · 매출 1)", W.bad_after?.count === 1 && W.bad_after.rows.join() === "12" && W.bad_revenue?.count === 1 && W.bad_revenue.rows.join() === "6");
ok("주의: 합계로 보이는 행 · 지급액 없는 행", W.summary?.count === 1 && W.summary.rows.join() === "9" && W.no_payout?.count === 1 && W.no_payout.rows.join() === "11");
ok("주의: 결제 완료인데 결제일 없음(파하가·카타파)", W.paid_no_date?.count === 2 && W.paid_no_date.rows.join() === "7,13", JSON.stringify(W.paid_no_date));
ok("주의: 결제일만 있고 결제 완료 아님(환불은 제외, 확인중 행)", W.date_not_paid?.count === 1 && W.date_not_paid.rows.join() === "12");
ok("주의: 읽을 수 없는 결제일 · 이상한 상태 · 파일명 · 결제 여부 빈칸", W.bad_date?.rows.join() === "13" && W.status_other?.rows.join() === "12" && W.upload_filename?.rows.join() === "7" && W.status_unset?.rows.join() === "6");
ok("주의: 'x' 같은 업로드 값은 별도 항목", s.parseSettlementSheet(table).warnings.some((w) => w.id === "upload_other" && w.rows.join() === "13"));
ok("주의 목록에 이름·금액 원문은 없고 행 번호만", r.warnings.every((w) => w.rows.every((n) => Number.isInteger(n)) && !/가나다|₩/.test(JSON.stringify(w))));

// 실패 · 경계
ok("헤더가 없으면 no_header", s.parseSettlementSheet([["a", "b"], ["1", "2"]]).error === "no_header");
ok("빈 표는 empty", s.parseSettlementSheet([]).error === "empty");
const noRev = s.parseSettlementSheet([["인플루언서명", "결제 여부"], ["가", "결제 완료"]]);
ok("필수 열(인플루언서명·결제 여부)만 있어도 읽고, 없는 열은 missing으로 알림", noRev.ok && noRev.rows.length === 1 && noRev.header.missing.includes("광고주 계약 매출") && !noRev.header.missing.includes("결제 여부"));
ok("열 제목의 공백 차이는 무시('인플루언서 명' · '결제여부')", s.parseSettlementSheet([["인플루언서 명", "결제여부", "지급 비용"], ["가", "결제 완료", "₩1,000"]]).ok === true);
const alias = s.parseSettlementSheet([["인플루언서", "결제 여부", "지급 비용", "공제 후 금액"], ["가", "결제 완료", "₩1,000", "₩967"]]);
ok("열 제목 별칭: 인플루언서·지급 비용", alias.ok && alias.rows[0].creator === "가" && alias.rows[0].cost === 1000 && alias.rows[0].after === 967);
ok("같은 입력이면 같은 결과", JSON.stringify(s.parseSettlementSheet(table)) === JSON.stringify(s.parseSettlementSheet(table)));

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
