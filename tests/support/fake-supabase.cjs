// 가짜 Supabase Storage 서버: 진짜 supabase-js 클라이언트가 보내는 요청(버킷 만들기·업로드(upsert)·다운로드)을 받아 메모리에 저장한다.
// 앱이 Storage를 올바르게 쓰는지 확인하려는 것이지, 진짜 Supabase의 동작을 보장하지는 않는다(오류 모양은 문서에 없어 추정).
// 테스트가 /_log 로 받은 요청 기록을 본다.
const http = require("http");

const buckets = new Map(); // 이름 → Map(경로 → {body, type})
const log = [];

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const send = (status, body, type = "application/json") => { res.writeHead(status, { "content-type": type }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/_log") return send(200, log);
    if (url.pathname === "/_reset") { buckets.clear(); log.length = 0; return send(200, "ok", "text/plain"); }

    const auth = req.headers.authorization || "";
    log.push({ method: req.method, path: url.pathname, upsert: req.headers["x-upsert"], auth: auth.startsWith("Bearer ") ? "bearer" : auth ? "other" : "none", type: req.headers["content-type"] || "" });
    if (!auth.startsWith("Bearer ")) return send(401, { statusCode: "401", error: "Unauthorized", message: "no auth" });

    const m = url.pathname.match(/^\/storage\/v1\/(bucket|object(?:\/authenticated)?)(?:\/([^/]+)(?:\/(.+))?)?$/);
    if (!m) return send(404, { message: "route not found" });
    const [, kind, bucket, objectPath] = m;

    if (kind === "bucket" && req.method === "POST") {
      const body = JSON.parse(raw.toString("utf8") || "{}");
      if (buckets.has(body.name)) return send(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      buckets.set(body.name, new Map());
      return send(200, { name: body.name });
    }
    if (kind.startsWith("object") && bucket && objectPath) {
      const store = buckets.get(bucket);
      if (!store) return send(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
      const key = decodeURIComponent(objectPath);
      if (req.method === "GET") {
        const o = store.get(key);
        return o ? send(200, o.body, o.type) : send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
      }
      if (req.method === "POST" || req.method === "PUT") {
        if (req.method === "POST" && store.has(key) && req.headers["x-upsert"] !== "true") return send(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        let body = raw;
        const ct = req.headers["content-type"] || "";
        if (/multipart\/form-data/.test(ct)) { // Blob으로 보냈을 때: 파일 부분만 꺼낸다
          const text = raw.toString("utf8");
          const i = text.indexOf("\r\n\r\n", text.indexOf('name=""') >= 0 ? text.indexOf('name=""') : text.lastIndexOf("Content-Type"));
          const end = text.lastIndexOf("\r\n--");
          body = Buffer.from(text.slice(i + 4, end), "utf8");
        }
        store.set(key, { body, type: "application/json" });
        return send(200, { Key: `${bucket}/${key}` });
      }
    }
    return send(404, { message: "not handled" });
  });
}).listen(4040, "127.0.0.1", () => console.log("fake supabase on 4040"));
