// 가짜 정산 시트 Apps Script 웹 앱: 실제 integrations/settlement-bridge/Code.gs 를 그대로 실행하는 HTTP 서버(포트 4021).
// 진짜 시트·진짜 구글에는 아무것도 보내지 않는다. 요청 기록은 /_log 로 볼 수 있다.
const http = require("http");
const path = require("path");
const { makeEnv } = require(path.join(__dirname, "../../integrations/sheet-bridge/test/gas-harness.cjs"));
const { rows } = require("./settlement-fixture.cjs");

const env = makeEnv(rows(), { token: "settle-token", code: path.join(__dirname, "../../integrations/settlement-bridge/Code.gs") });
const log = [];

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (text) => { res.writeHead(200, { "content-type": "application/json" }); res.end(text); };
    if (req.url === "/_log") return send(JSON.stringify(log));
    if (req.method === "GET") return send(env.exports.doGet().text);
    let action = "";
    try { action = JSON.parse(body || "{}").action; } catch { /* 잘못된 JSON */ }
    log.push({ action });
    send(env.doPost({ postData: { contents: body } }).text);
  });
}).listen(4021, "127.0.0.1", () => console.log("fake settlement on 4021"));
