// 정산 시트: 연결(SETTLEMENT_SCRIPT_*)이 설정되지 않았을 때의 안내 화면과 메뉴. 이 시험은 정산 환경변수 없이 서버를 띄워서 돌린다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("[data-widget]");

  // 메뉴: 정산 > 정산 시트
  await p.getByRole("navigation", { name: "대분류" }).getByRole("button", { name: /^정산/ }).click();
  const link = p.locator('[data-slot="sidebar"]').getByRole("link", { name: "정산 시트", exact: true });
  ok("사이드바 '정산' 메뉴에 '정산 시트'가 있음", await until(async () => (await link.count()) === 1));
  await link.click();
  await p.waitForURL("**/settlement-sheet");
  ok("헤더 제목: 정산 시트", await until(async () => (await p.getByRole("heading", { name: "정산 시트" }).count()) >= 1));

  // 연결 전: 설정 안내
  ok("연결 전: 설정 안내 화면", await until(async () => (await p.getByText("정산 시트 연결이 아직 설정되지 않았습니다").count()) === 1));
  const txt = await p.locator("body").innerText();
  ok("안내에 필요한 환경변수 두 개와 다리 코드 위치", txt.includes("SETTLEMENT_SCRIPT_URL") && txt.includes("SETTLEMENT_SCRIPT_TOKEN") && txt.includes("integrations/settlement-bridge/Code.gs"));
  ok("안내는 값을 직접 입력하라고 함(채팅·저장소에 적지 않음)", txt.includes("직접 입력"));
  ok("연결 전에는 표나 금액이 없음", (await p.getByRole("table").count()) === 0);
  const api = await ctx.request.get(`${BASE}/api/leads/settlement`);
  ok("API: 503 settlement_not_configured", api.status() === 503 && (await api.json()).error === "settlement_not_configured", String(api.status()));
  ok("화면 오류 없음", errs.length === 0, errs.join(" | "));

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
