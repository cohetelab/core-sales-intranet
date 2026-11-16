const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const k = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const stamp = (ms) => k(ms).slice(0, 16).replace("T", " ");
const sd = (ms) => { const [y, m, d] = k(ms).slice(0, 10).split("-"); return `${y}. ${+m}. ${+d}.`; };
const D = 86400000;

(async () => {
  const now = Date.now();
  const A = (cells) => admin("append", { cells: { 5: "영상 제작", 6: "홈페이지", ...cells } });
  await A({ 0: stamp(now - 2 * D), 1: "홈R1", 2: "010-7100-0001", 16: "₩2,000,000" }); // 단계 비어 있고 금액만 → 계약
  await A({ 0: stamp(now - 2 * D), 1: "홈R2", 2: "010-7100-0002", 4: "계약" });
  await A({ 0: stamp(now - 5 * D), 1: "홈지난일정", 2: "010-7100-0003", 4: "상담", 10: "이익재(Ian)", 13: sd(now - 1 * D), 15: "견적 재발송" });
  await A({ 0: stamp(now - 5 * D), 1: "홈내일일정", 2: "010-7100-0004", 4: "제안", 10: "김세현(Connor)", 13: sd(now + 1 * D), 15: "계약서 전달" });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const text = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok("로그인 전에는 시트 로그인 카드(가짜 숫자 대신)", (await p.getByLabel("리드 화면 비밀번호").count()) === 1);
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  let t = await text();
  ok("샘플(MRR·계약 MRR) 문구가 없음", !t.includes("계약 MRR") && !t.includes("MRR 추이"));
  ok("오늘의 업무 + 한국 날짜", t.includes("오늘의 업무") && /\d+월 \d+일 .요일/.test(t));
  ok("계약 금액 합계 ₩2,000,000", t.includes("₩2,000,000"));
  ok("계약 3곳 · 금액 기재 1곳", t.includes("계약 3곳 · 금액 기재 1곳"), (t.match(/계약 \d+곳 · 금액 기재 \d+곳/) || [""])[0]);
  ok("오늘·내일 일정에 지난 일정·내일 일정 고객", t.includes("홈지난일정 · 견적 재발송") && t.includes("홈내일일정 · 계약서 전달"));
  ok("기한이 지난 일정 1건 표시", t.includes("기한이 지난 일정 1건"));
  ok("오늘의 점검 5항목", (await p.getByRole("list", { name: "오늘의 점검" }).getByRole("listitem").count()) === 5);
  ok("점검: 리터치 일정 지남 1건", (await p.getByRole("list", { name: "오늘의 점검" }).locator("li", { hasText: "리터치 일정 지남" }).innerText()).includes("1건"));
  ok("응답 속도 카드", t.includes("응답 속도 · 최근 30일") && t.includes("인트라넷에서 남긴 기록만 집계됩니다"));
  ok("월별 문의 (이번 달 항목)", (await p.getByRole("list", { name: "월별 문의" }).getByRole("listitem").count()) >= 1 && t.includes(k(now).slice(0, 7)));
  ok("최근 활동의 상대 시간이 실제 현재 기준(2일 전)", (await p.getByRole("list", { name: "최근 활동" }).innerText()).includes("2일 전") && !(await p.getByRole("list", { name: "최근 활동" }).innerText()).includes("171일"));
  ok("최근 활동 목록", (await p.getByRole("list", { name: "최근 활동" }).getByRole("listitem").count()) >= 1);
  ok("크리에이터 커뮤니티 카드는 그대로", t.includes("크리에이터 커뮤니티"));
  ok("샘플 안내 배너는 홈에 없음", (await p.getByRole("note").filter({ hasText: "샘플 데이터" }).count()) === 0);

  // 샘플 화면에는 안내 배너
  for (const [url, label] of [["/team", "팀"], ["/weekly", "주간"], ["/campaigns", "캠페인"], ["/quotes", "계약·견적"], ["/sales-invoices", "세금계산서"], ["/agents", "에이전트"], ["/calendar", "캘린더"]]) {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    ok(`${label}(${url}): '샘플 데이터' 안내가 보임`, await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { if ((await p.getByRole("note").filter({ hasText: "샘플 데이터" }).count()) === 1) return true; await p.waitForTimeout(200); } return false; })());
  }
  // 시트와 연결된 화면에는 안내가 없음
  for (const url of ["/leads", "/pipeline", "/customers", "/reports"]) {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    ok(`${url}: 안내 없음`, (await p.getByRole("note").filter({ hasText: "샘플 데이터" }).count()) === 0);
  }

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=오늘의 업무");
  await p.screenshot({ path: out("home.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
