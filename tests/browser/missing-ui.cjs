const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const SCREENS = [["/", "홈"], ["/leads", "리드 인박스"], ["/pipeline", "파이프라인"], ["/customers", "고객사"], ["/reports", "리포트"]];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const warn = () => p.getByRole("alert", { name: "시트 열 확인" });
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  // 1) 칸이 다 있을 때는 경고가 없다
  for (const [url, label] of SCREENS) {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await p.waitForSelector("text=시트가 원본입니다");
    ok(`${label}: 열이 모두 있으면 경고 없음`, (await warn().count()) === 0);
  }

  // 2) 시트의 헤더(3번째 줄)에서 '계약 금액'(17열)을 '금액'으로, '단계'(5열)를 '상태'로 바꾼다
  await admin("set", { row: 3, col: 17, value: "금액" });
  await admin("set", { row: 3, col: 5, value: "상태" });
  for (const [url, label] of SCREENS) {
    await p.goto(`${BASE}${url}?_=${Date.now()}`, { waitUntil: "networkidle" });
    await p.waitForSelector("text=시트가 원본입니다");
    ok(`${label}: 이름이 바뀐 칸 경고가 보임`, await until(async () => (await warn().count()) === 1));
    const t = (await warn().innerText()).replace(/\s+/g, " ");
    ok(`${label}: 2개 칸 · 계약 금액·단계 · 영향 · 알아보는 이름`, /2개 칸을 찾지 못했습니다/.test(t) && t.includes("계약 금액") && t.includes("단계") && t.includes("계약 금액과 계약 판정이 비어 보입니다") && t.includes("알아보는 이름: 계약금액"), t);
  }

  // 3) 헤더를 되돌리면 경고가 사라진다(주기적 확인으로 갱신)
  await admin("set", { row: 3, col: 17, value: "계약 금액" });
  await admin("set", { row: 3, col: 5, value: "단계" });
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "새로고침" }).click();
  ok("헤더를 되돌리고 새로고침하면 경고가 사라짐", await until(async () => (await warn().count()) === 0));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
