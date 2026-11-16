const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const k = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const stamp = (ms) => k(ms).slice(0, 16).replace("T", " ");
const month = (ms) => k(ms).slice(0, 7);
const D = 86400000;

(async () => {
  const now = Date.now();
  const A = (cells) => admin("append", { cells: { 2: "", 5: "영상 제작", ...cells } });
  await A({ 0: stamp(now - 2 * D), 1: "리포트R1", 2: "010-7000-0001", 6: "홈페이지", 16: "₩2,000,000" }); // 단계 비어 있고 금액만
  await A({ 0: stamp(now - 2 * D), 1: "리포트R2", 2: "010-7000-0002", 5: "퍼포먼스 마케팅", 6: "META_통합", 4: "계약" }); // 단계 계약, 금액 없음
  await A({ 0: stamp(now - 3 * D), 1: "리포트R3", 2: "010-7000-0003", 6: "홈페이지", 14: `[${k(now - 3 * D + 3600000).slice(5, 7)}.${k(now - 3 * D + 3600000).slice(8, 10)} ${k(now - 3 * D + 3600000).slice(11, 16)} Ian] 통화` }); // 상담 기록만

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const rowText = async (table, key) => (await p.getByRole("table", { name: table }).locator("tr", { hasText: key }).first().innerText()).replace(/\s+/g, " ").trim();
  const stat = async (label) => (await p.locator("div", { has: p.getByText(label, { exact: true }) }).filter({ hasText: label }).last().innerText()).replace(/\s+/g, " ");

  await p.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  ok("로그인 전에는 시트 로그인 카드", (await p.getByLabel("리드 화면 비밀번호").count()) === 1);
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  ok("샘플 숫자 화면(쿼터·MRR)이 아닌 시트 리포트", (await p.getByText("팀 쿼터 달성률").count()) === 0 && (await p.getByText("채널별").count()) >= 1);
  ok("기간 칩 5개(전체·90일·30일·7일·1일)", (await p.getByRole("group", { name: "기간" }).getByRole("button").allInnerTexts()).join("|") === "전체 기간|최근 90일|최근 30일|최근 7일|최근 1일");

  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 30일" }).click();
  await p.waitForTimeout(300);
  const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  ok("최근 30일: 문의 고객 3명", /문의 고객 3명/.test(body));
  ok("상담 기록 이상 3명", /상담 기록 이상 3명/.test(body));
  ok("계약 2명", /계약 2명/.test(body));
  ok("계약 금액 합계 ₩2,000,000 · 금액 적힌 1건/전체 2건", body.includes("₩2,000,000") && body.includes("금액이 적힌 계약 1건 / 전체 2건"));
  ok("안내: 단계가 비어도 계약 금액이 있으면 계약이며 다른 화면도 같은 기준", body.includes("단계 칸이 비어 있고 ‘계약 금액’이 적힌 고객입니다") && body.includes("다른 화면(파이프라인·고객사)도 같은 기준입니다"));

  const hp = await rowText("채널별", "홈페이지"), me = await rowText("채널별", "META");
  ok("채널 홈페이지: 문의 2 · 상담 2 · 계약 1 · 50% · ₩2,000,000", /^홈페이지 2 2 1 50% ₩2,000,000$/.test(hp), hp);
  ok("채널 META: 문의 1 · 상담 1 · 계약 1 · 100% · 금액 -", /^META 1 1 1 100% -$/.test(me), me);
  const sf = await rowText("서비스별", "숏폼"), sp = await rowText("서비스별", "퍼포먼스");
  ok("서비스 숏폼: 문의 2 · 계약 1", /^숏폼 2 2 1 50%/.test(sf), sf);
  ok("서비스 퍼포먼스: 문의 1 · 계약 1", /^퍼포먼스 1 1 1 100%/.test(sp), sp);
  const mo = await rowText("월별 문의", month(now));
  ok("월별: 이번 달 문의 3 · 홈페이지 2 · META 1 · 계약 2", new RegExp(`^${month(now)} 3 `).test(mo) && mo.endsWith(" 2"), mo);

  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 7일" }).click();
  await p.waitForTimeout(300);
  ok("최근 7일: 3일 전까지 들어온 3명 모두 포함", /문의 고객 3명/.test((await p.locator("body").innerText()).replace(/\s+/g, " ")));
  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 1일" }).click();
  await p.waitForTimeout(300);
  const day1 = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  ok("최근 1일: 2~3일 전 문의라 0명 + 빈 표 안내", /문의 고객 0명/.test(day1) && (await p.getByText("이 기간에 들어온 문의가 없습니다").count()) === 3);
  ok("최근 1일 선택이 눌린 상태", (await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 1일" }).getAttribute("aria-pressed")) === "true");
  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "전체 기간" }).click();
  await p.waitForTimeout(300);
  const all = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const m = all.match(/문의 고객 ([\d,]+)명/);
  ok("전체 기간: 문의 고객이 60명 넘음", m && Number(m[1].replace(/,/g, "")) > 60, m && m[0]);
  ok("전체 기간 월별에 2026-04(예전 문의)도 나옴", (await p.getByRole("table", { name: "월별 문의" }).locator("tr", { hasText: "2026-04" }).count()) === 1);
  ok("캠페인·소재 칸이 없다는 안내", all.includes("캠페인·소재 칸이 없어서 지금은 채널까지만"));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 30일" }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: out("reports.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
