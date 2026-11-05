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
  ok("값이 너무 길면 too_long", send(e, [upd(e, 4, { col: "메모", expect: "", value: "가".repeat(2001) })]).results[0].reason === "too_long");
  ok("update 빈 배열/없음 → bad_updates", send(e, []).error === "bad_updates" && e.call({ token: T, action: "update" }).error === "bad_updates");
  ok("1001건 초과 → bad_updates", send(e, Array(1001).fill(upd(e, 4))).error === "bad_updates");
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
console.log(fail ? `\n실패 ${fail}건` : "\n전부 통과");
process.exit(fail ? 1 : 0);
