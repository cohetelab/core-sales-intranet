// 가짜 Apps Script 웹 앱: 실제 Code.gs를 그대로 실행하는 HTTP 서버 + 테스트가 시트를 직접 조작하는 /admin API.
// (저장소의 integrations/sheet-bridge/test/gas-harness.cjs 를 사용한다)
const http = require("http");
const { makeEnv, fixture } = require(require("path").join(__dirname, "../../integrations/sheet-bridge/test/gas-harness.cjs"));

const PORT = 4020;
const rows = fixture(60);
// 재문의(고객 0과 같은 연락처), 테스트 행, 이미 계약된 고객, 실패/종료 고객
const tmpl = (over) => { const r = Array(18).fill(""); Object.entries(over).forEach(([i, v]) => (r[i] = v)); return r; };
rows.push(tmpl({ 0: "2026-04-02 09:05", 1: "가짜브랜드0", 2: "010-1000-2000", 3: "f0@example.com", 5: "퍼포먼스 마케팅", 6: "META_통합" }));
rows.push(tmpl({ 0: "2026-04-02 09:06", 1: "test", 2: "phone_number", 6: "test" }));
rows.push(tmpl({ 0: "2026-04-02 09:07", 1: "가짜계약고객", 2: "010-7777-0001", 5: "영상 제작", 6: "홈페이지", 4: "계약", 10: "이익재(Ian)" }));
rows.push(tmpl({ 0: "2026-04-02 09:08", 1: "가짜실패고객", 2: "010-7777-0002", 5: "영상 제작", 6: "홈페이지", 4: "실패/종료" }));
const env = makeEnv(rows);
let down = false;
let beforeNextUpdate = null; // 다음 update 요청이 처리되기 직전에 시트에 가할 변경 {row, col, value}(경쟁 상황 흉내)
const calls = { read: 0, update: 0 };

const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
http.createServer(async (req, res) => {
  const body = await readBody(req);
  const send = (obj, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.url.startsWith("/admin/")) {
    const op = req.url.slice(7), a = body ? JSON.parse(body) : {};
    const data = env.data;
    if (op === "down") { down = !!a.down; return send({ ok: true }); }
    if (op === "append") { data.rows.push(tmpl(a.cells)); return send({ ok: true, row: data.rows.length }); }
    if (op === "set") { data.set(a.row, a.col, a.value); return send({ ok: true }); }
    if (op === "insert-above") { data.rows.splice(a.row - 1, 0, tmpl(a.cells || {})); return send({ ok: true }); }
    if (op === "race") { beforeNextUpdate = a && a.row ? a : null; return send({ ok: true }); }
    if (op === "dump") return send({ rows: data.rows, log: (env.sheets.find((s) => s.name === "인트라넷_기록") || { rows: [] }).rows, calls });
    return send({ error: "bad_admin" }, 400);
  }
  if (down) return send({ ok: false, error: "server_error" }, 503);
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = body; }
  if (parsed && parsed.action === "read") calls.read++;
  if (parsed && parsed.action === "update") {
    calls.update++;
    if (beforeNextUpdate) { env.data.set(beforeNextUpdate.row, beforeNextUpdate.col, beforeNextUpdate.value); beforeNextUpdate = null; }
  }
  return send(env.call(typeof parsed === "string" ? parsed : parsed));
}).listen(PORT, "127.0.0.1", () => console.log("fake sheet on", PORT));
