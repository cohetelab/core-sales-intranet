const { makeEnv, fixture } = require("./gas-harness.cjs");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };
const T = "secret-token";
const OWNER = 11; // 담당자 = K열(1부터)
const upd = (env, rowIdx, over = {}) => {
  const r = env.data.rows[rowIdx - 1];
  return { row: rowIdx, stamp: r[0], phone: r[2].replace(/\D/g, ""), col: "담당자", expect: r[OWNER - 1], value: "이익재(Ian)", ...over };
};
const send = (e, updates, user = "u") => e.call({ token: T, action: "update", user, updates });

{
  const e = makeEnv(fixture());
  ok("토큰 없음 → unauthorized", e.call({ action: "read" }).error === "unauthorized");
  ok("토큰 틀림 → unauthorized", e.call({ token: "x", action: "read" }).error === "unauthorized");
  ok("잘못된 JSON → server_error", e.call("{not json").error === "server_error");
  ok("알 수 없는 action → bad_action", e.call({ token: T, action: "drop" }).error === "bad_action");
  const r = e.call({ token: T, action: "read" });
  ok("read: 값/URL/탭 정보", r.ok && r.values.length === 10 && /docs.google.com/.test(r.sheetUrl) && r.sheetName === "문의" && r.gid === 42);
  const g = JSON.parse(e.exports.doGet().text);
  ok("doGet은 데이터 없이 상태만", g.service === "sheet-bridge" && !("values" in g));
}
{
  const e = makeEnv(fixture());
  const res = send(e, [upd(e, 4), upd(e, 5)], "이익재(Ian)");
  ok("정상 쓰기 2건", res.ok && res.results.every(x => x.ok));
  ok("담당자 칸에 실제로 기록", e.data.rows[3][OWNER - 1] === "이익재(Ian)" && e.data.rows[4][OWNER - 1] === "이익재(Ian)");
  ok("같은 값은 한 번의 범위 쓰기(2셀)", e.data.calls.rangeList === 1 && e.data.calls.setValue === 2);
  ok("다른 칸은 그대로(상호명·연락처 불변)", e.data.rows[3][1] === "가짜브랜드0" && e.data.rows[3][2] === "010-1000-2000");
  const log = e.sheets.find(s => s.name === "인트라넷_기록");
  ok("로그 탭 생성 + 헤더 + 2줄", log && log.rows.length === 3 && log.rows[0][0] === "시각" && log.rows[1][1] === "이익재(Ian)" && log.rows[1][7] === "ok");
  ok("스크립트 잠금 사용", e.locks() === 1);
  ok("기록 탭을 만들어도 원래 활성 시트·첫 번째 탭은 그대로", e.active() === e.data && e.sheets[0] === e.data && e.sheets[e.sheets.length - 1].name === "인트라넷_기록");
}
{
  const e = makeEnv(fixture());
  const res = send(e, [upd(e, 4, { expect: "다른사람이 먼저 입력" })]);
  ok("먼저 수정된 칸 → conflict, 쓰지 않음", res.results[0].reason === "conflict" && e.data.rows[3][OWNER - 1] === "");
}
{
  const e = makeEnv(fixture());
  const r1 = send(e, [upd(e, 4, { stamp: "2026-01-01 00:00" })]);
  const r2 = send(e, [upd(e, 4, { phone: "01099999999" })]);
  ok("날짜 다르면 row_moved", r1.results[0].reason === "row_moved");
  ok("연락처 다르면 row_moved", r2.results[0].reason === "row_moved");
  ok("거절된 요청은 아무 칸도 안 바뀜", e.data.rows[3][OWNER - 1] === "");
}
{
  const e = makeEnv(fixture());
  const stale = [upd(e, 4), upd(e, 5)]; // 행 번호를 읽어 둔 뒤
  e.data.rows.splice(3, 0, ["2026-02-01 09:00", "새로 끼어든 행", "010-5555-5555", ...Array(15).fill("")]); // 누군가 위에 행을 삽입
  const res = send(e, stale);
  ok("행이 밀린 뒤에는 엉뚱한 행에 쓰지 않음", res.results.every(x => !x.ok && x.reason === "row_moved") && e.data.rows.every(r => r[OWNER - 1] !== "이익재(Ian)"));
}
{
  const e = makeEnv(fixture());
  for (const col of ["상호명", "연락처", "날짜", "이메일", "서비스 구분", "유입 경로", "예산"]) {
    const res = send(e, [upd(e, 4, { col, expect: "", value: "x" })]);
    ok(`자동 입력 칸 '${col}' 쓰기 거절`, res.results[0].reason === "not_writable");
  }
}
{
  const e = makeEnv(fixture());
  e.data.formulas[`4,${OWNER}`] = '=IF(A4>0,"x","")';
  const res = send(e, [upd(e, 4), upd(e, 5)]);
  ok("수식 칸은 거절, 다른 행은 정상", res.results[0].reason === "formula" && res.results[1].ok === true && e.data.rows[3][OWNER - 1] === "");
}
{
  const e = makeEnv(fixture());
  const res = send(e, [upd(e, 4, { col: "메모", expect: "", value: '=HYPERLINK("http://evil","x")' })]);
  ok("'='로 시작하는 값은 수식이 아닌 글자로 저장", res.results[0].ok && e.data.raw["R4"].startsWith("'="), e.data.raw["R4"].slice(0, 16));
}
{
  const e = makeEnv(fixture());
  const res = send(e, [upd(e, 4), upd(e, 4, { value: "김세현(Connor)" })]);
  ok("같은 행·칸 중복 요청은 두 번째 거절", res.results[0].ok && res.results[1].reason === "duplicate" && e.data.rows[3][OWNER - 1] === "이익재(Ian)");
}
{
  const e = makeEnv(fixture());
  const bad = ["99", "-1", "2", "3", "abc", "4.5"].map(row => send(e, [upd(e, 4, { row })]).results[0].reason);
  ok("행 범위를 벗어나면 bad_row", bad.every(x => x === "bad_row"), `(${bad.join(",")})`);
  ok("값이 너무 길면 too_long(5000자 초과)", send(e, [upd(e, 4, { col: "메모", expect: "", value: "가".repeat(5001) })]).results[0].reason === "too_long");
  ok("5000자까지는 허용", send(e, [upd(e, 4, { col: "메모", expect: "", value: "가".repeat(5000) })]).results[0].ok === true);
  ok("update 빈 배열/없음 → bad_updates", send(e, []).error === "bad_updates" && e.call({ token: T, action: "update" }).error === "bad_updates");
  ok("1001건 초과 → bad_updates", send(e, Array(1001).fill(upd(e, 4))).error === "bad_updates");
}
{
  // 상담 기록: 한 행에 서로 다른 칸을 서로 다른 값으로 한 번에 쓴다(칸 이름에 공백이 있어도 맞춘다)
  const e = makeEnv(fixture());
  const r = e.data.rows[3];
  const base = { row: 4, stamp: r[0], phone: r[2].replace(/\D/g, "") };
  const note = "[11.06 14:30 Ian] 첫 통화\n가격 문의";
  const res = send(e, [
    { ...base, col: "1차 상담 내용", expect: "", value: note },
    { ...base, col: "다음 액션 플랜", expect: "", value: "견적 발송" },
    { ...base, col: "가능성", expect: "", value: "30%" },
    { ...base, col: "최근 연락일", expect: "", value: "2026. 11. 6." },
    { ...base, col: "리터치 일정", expect: "", value: "2026. 11. 10." },
  ], "이익재(Ian)");
  ok("상담 기록 5칸을 한 번에 기록", res.ok && res.results.every(x => x.ok));
  ok("줄바꿈이 든 상담 내용도 그대로 저장", e.data.rows[3][14] === note && e.data.rows[3][15] === "견적 발송" && e.data.rows[3][11] === "30%");
  const log = e.sheets.find(s => s.name === "인트라넷_기록");
  ok("칸마다 기록 1줄(5줄 + 헤더)", log.rows.length === 6 && log.rows.slice(1).every(l => l[1] === "이익재(Ian)" && l[7] === "ok"));
  // 폼을 연 뒤 다른 사람이 상담 내용을 먼저 고친 경우: 기준값(expect)이 달라서 거절
  e.data.rows[3][14] = "다른 사람이 쓴 상담 내용";
  const stale = send(e, [{ ...base, col: "1차 상담 내용", expect: note, value: note + "\n[11.06 15:00 Ian] 추가" }]);
  ok("폼을 연 뒤 시트가 바뀌면 conflict(덮어쓰지 않음)", stale.results[0].reason === "conflict" && e.data.rows[3][14] === "다른 사람이 쓴 상담 내용");
}
{
  const e = makeEnv(fixture(450)); // 450명 일괄 배정
  const rows = [];
  for (let r = 4; r <= e.data.rows.length; r++) if (e.data.rows[r - 1][1]) rows.push(r);
  const t0 = Date.now();
  const res = send(e, rows.map(r => upd(e, r, { value: "김세현(Connor)" })));
  ok("450건 일괄 배정이 범위 쓰기 1번으로 처리", res.ok && res.results.length === 450 && res.results.every(x => x.ok) && e.data.calls.rangeList === 1, `(${Date.now() - t0}ms, 셀 ${e.data.calls.setValue})`);
}
{
  const e = makeEnv(fixture());
  const f = e.exports.findHeader_([["메모"], ["2026"], ["날짜", "상호명", "연락처"], ["x"]]);
  ok("헤더는 3번째 행에서 찾음", f.row === 3 && f.cols["상호명"] === 1);
  ok("열 문자 변환(A, Z, AA, AB)", [0, 25, 26, 27].map(e.exports.columnLetter_).join(",") === "A,Z,AA,AB");
}
{
  // 독립 프로젝트(시트에 붙지 않음): 시트 ID 속성이 없으면 무슨 설정이 빠졌는지 알려 준다
  const e = makeEnv(fixture(), { activeNull: true });
  const r = e.call({ token: T, action: "read" });
  ok("시트 ID가 없으면 빠진 설정을 알려 줌", r.error === "server_error" && /BRIDGE_SPREADSHEET_ID/.test(r.message), r.message);
  const e2 = makeEnv(fixture(), { activeNull: true, spreadsheetId: "abc" });
  ok("BRIDGE_SPREADSHEET_ID가 있으면 읽기 성공", e2.call({ token: T, action: "read" }).ok === true);
}
{
  // 설정 도우미: 토큰이 없을 때만 만들고, 다시 실행해도 같은 값을 보여 준다
  const e = makeEnv(fixture(), { token: null });
  ok("토큰이 없으면 모든 요청 거절", e.call({ token: "", action: "read" }).error === "unauthorized");
  const t1 = e.exports.setupToken();
  const t2 = e.exports.setupToken();
  ok("setupToken: 64자 토큰 생성, 다시 실행해도 같은 값", /^[0-9a-f]{64}$/.test(t1) && t1 === t2);
  ok("만든 토큰으로 읽기 가능, 틀린 토큰은 거절", e.call({ token: t1, action: "read" }).ok === true && e.call({ token: "x".repeat(64), action: "read" }).error === "unauthorized");
}
{
  // 시트 칸에 입력 규칙(드롭다운)이 걸려 있을 때: 허용 안 되는 값은 그 건만 실패로 돌려주고, 허용 목록을 알려 준다
  const STAGE = 5; // 단계 = E열
  const e = makeEnv(fixture());
  e.data.validations[STAGE] = ["리드", "연락됨", "딜 (제안중)", "제안서 전달", "견적서 전달", "계약서 전달", "성사", "실패/종료", "부재중"];
  const stageUpd = (rowIdx, value) => upd(e, rowIdx, { col: "단계", expect: e.data.rows[rowIdx - 1][STAGE - 1], value });
  const r = send(e, [stageUpd(4, "연락됨"), stageUpd(5, "상담")]);
  ok("요청 전체가 죽지 않음(ok:true)", r.ok === true && r.results.length === 2, JSON.stringify(r));
  ok("허용된 값은 그대로 기록", r.results[0].ok === true && e.data.rows[3][STAGE - 1] === "연락됨");
  ok("허용 안 되는 값은 그 건만 rejected + 허용 목록", r.results[1].ok === false && r.results[1].reason === "rejected" && r.results[1].allowed.join() === "리드,연락됨,딜 (제안중),제안서 전달,견적서 전달,계약서 전달,성사,실패/종료,부재중", JSON.stringify(r.results[1]));
  ok("거절된 칸은 바뀌지 않음", e.data.rows[4][STAGE - 1] === "");
  const log = e.sheets.find((s) => s.name === "인트라넷_기록").rows.map((x) => x[7]);
  ok("기록 탭에 ok·rejected가 남음", log.includes("ok") && log.includes("rejected"), log.join());
  const r2 = send(e, [stageUpd(4, "")]);
  ok("빈 값(리드로 되돌리기)은 허용", r2.results[0].ok === true && e.data.rows[3][STAGE - 1] === "");
}
{
  // 규칙을 읽지 못하고, 위반 예외가 setValue 가 아니라 나중(flush)에 올라오는 경우에도 요청 전체가 죽지 않고 그 건만 실패
  const STAGE = 5;
  const e = makeEnv(fixture());
  e.data.validations[STAGE] = ["리드", "연락됨", "딜 (제안중)", "제안서 전달", "견적서 전달", "계약서 전달", "성사", "실패/종료", "부재중"];
  e.data.validationHidden = true;
  e.data.lazyValidation = true;
  const stageUpd = (rowIdx, value) => upd(e, rowIdx, { col: "단계", expect: e.data.rows[rowIdx - 1][STAGE - 1], value });
  const r = send(e, [stageUpd(4, "연락됨"), stageUpd(5, "상담")]);
  ok("늦게 터지는 예외도 요청 전체가 죽지 않음", r.ok === true && r.results.length === 2, JSON.stringify(r));
  ok("늦은 예외: 규칙을 못 읽어도 그 건만 rejected", r.results[0].ok === true && r.results[1].ok === false && r.results[1].reason === "rejected", JSON.stringify(r.results));
  ok("늦은 예외: 시트 메시지가 그대로 전달됨", /Stages/.test(r.results[1].message || ""), r.results[1].message);
}
{
  // 예상 못 한 예외는 server_error 에 줄 위치(@)가 붙는다
  const e = makeEnv(fixture());
  e.data.getDataRange = () => { throw new Error("boom"); };
  const r = e.call({ token: T, action: "read" });
  ok("server_error 메시지에 위치 표시", r.error === "server_error" && /boom/.test(r.message) && /@/.test(r.message), r.message);
}
console.log(fail ? `\n실패 ${fail}건` : "\n전부 통과");
process.exit(fail ? 1 : 0);
