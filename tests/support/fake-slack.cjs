// 가짜 Slack 수신 웹훅: 받은 글을 기록하고, 성공하면 "ok"를 돌려준다. 테스트가 /_ 로 상태를 조작한다.
const http = require("http");
const posts = [];
let mode = "ok";
http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url === "/_posts") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(posts)); }
    if (req.url === "/_mode") { mode = JSON.parse(b || "{}").mode || "ok"; res.writeHead(200); return res.end("ok"); }
    if (req.url === "/_reset") { posts.length = 0; mode = "ok"; res.writeHead(200); return res.end("ok"); }
    if (req.method === "POST" && req.url.startsWith("/services/")) {
      posts.push({ url: req.url, type: req.headers["content-type"], body: b });
      if (mode === "404") { res.writeHead(404); return res.end("no_service"); }
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    res.writeHead(404); res.end("nope");
  });
}).listen(4030, "127.0.0.1", () => console.log("fake slack on 4030"));
