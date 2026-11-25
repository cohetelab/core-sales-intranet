// 정산 시트 브리지(Code.gs)를 Node에서 그대로 실행해 확인한다. 읽기 전용이고 토큰이 맞아야만 읽힌다.
const path = require("path");
const { makeEnv } = require("../../integrations/sheet-bridge/test/gas-harness.cjs");
const { rows } = require("../support/settlement-fixture.cjs");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };
const code = path.join(__dirname, "../../integrations/settlement-bridge/Code.gs");
const T = "settle-token";

const e = makeEnv(rows(), { token: T, code });
const before = JSON.stringify(e.data.rows);
ok("토큰 없음 · 틀림 → unauthorized", e.call({ action: "read" }).error === "unauthorized" && e.call({ token: "x", action: "read" }).error === "unauthorized");
ok("잘못된 JSON → server_error(위치 표시)", (() => { const r = e.call("{not json"); return r.error === "server_error" && /@/.test(r.message); })());
const r = e.call({ token: T, action: "read" });
ok("read: 값 · 탭 이름 · 주소 · gid", r.ok === true && Array.isArray(r.values) && r.values.length === rows().length && r.sheetName === "문의" && /docs.google.com/.test(r.sheetUrl) && r.gid === 42);
ok("read: 열 제목이 첫 줄에 있음", r.values[0][3] === "인플루언서명" && r.values[0][9] === "결제 여부");
ok("쓰기 동작은 없음: update · append · 알 수 없는 action → bad_action", ["update", "append", "write", "drop"].every((a) => e.call({ token: T, action: a, updates: [{ row: 2, col: "결제 여부", value: "결제 완료" }] }).error === "bad_action"));
ok("어떤 요청을 보내도 시트 내용은 그대로", JSON.stringify(e.data.rows) === before && e.sheets.length === 1);
ok("GET 상태 확인", JSON.parse(e.exports.doGet().text).service === "settlement-bridge");
const t = makeEnv(rows(), { token: null, code });
ok("토큰이 없으면 모든 요청 거절", t.call({ token: "", action: "read" }).error === "unauthorized");
const t1 = t.exports.setupToken(); const t2 = t.exports.setupToken();
ok("setupToken: 64자 토큰, 다시 실행해도 같은 값", /^[0-9a-f]{64}$/.test(t1) && t1 === t2);
ok("만든 토큰으로 읽기 가능", t.call({ token: t1, action: "read" }).ok === true);
const noId = makeEnv(rows(), { token: T, code, activeNull: true });
ok("시트 ID가 없고 시트에 붙지 않았으면 빠진 설정을 알려 줌", /BRIDGE_SPREADSHEET_ID/.test(noId.call({ token: T, action: "read" }).message || ""));

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
