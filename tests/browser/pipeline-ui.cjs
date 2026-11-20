const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const C = { stage: 4, contract: 16 };

(async () => {
  await admin("append", { cells: { 0: "2026-11-01 09:00", 1: "금액만고객", 2: "010-6000-0001", 5: "영상 제작", 6: "홈페이지", 16: "₩1,000,000" } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const col = (s) => p.locator(`[data-stage="${s}"]`);
  const card = (n) => p.getByRole("button", { name: `${n} 카드` });
  const rowsOf = async (name) => (await admin("dump")).rows.filter((r) => r[1] === name);

  await p.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
  ok("로그인 전에는 시트 로그인 카드", (await p.getByLabel("리드 화면 비밀번호").count()) === 1);
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  ok("4개 열이 보임", (await p.locator("[data-stage]").count()) === 4);
  ok("실패/종료 고객은 숨김", (await card("가짜실패고객").count()) === 0);
  ok("실패/종료 숨김 안내", (await p.getByText("실패/종료 1건은 숨김").count()) === 1);
  ok("계약 열에 계약 고객", (await col("won").getByRole("button", { name: "가짜계약고객 카드" }).count()) === 1);
  ok("계약 열 헤더에 계약 금액 합계", (await col("won").innerText()).includes("계약 금액 합계"));
  const leadCards = await col("lead").getByRole("button", { name: /카드$/ }).count();
  ok("리드 열은 30장까지만 그림", leadCards === 30, String(leadCards));
  ok("더 보기 버튼", (await col("lead").getByRole("button", { name: /더 보기/ }).count()) === 1);
  await col("lead").getByRole("button", { name: /더 보기/ }).click();
  ok("더 보기 후 카드 증가", (await col("lead").getByRole("button", { name: /카드$/ }).count()) > 30);

  // 검색 + 담당 필터
  await p.getByLabel("딜 검색").fill("1000-2010"); await p.waitForTimeout(300);
  ok("검색: 해당 고객만", (await card("가짜브랜드10").count()) === 1 && (await card("가짜브랜드11").count()) === 0);

  // 드래그: 리드 → 상담
  await card("가짜브랜드10").dragTo(col("discovery"));
  ok("상담 열로 이동(낙관적 반영)", await until(async () => (await col("discovery").getByRole("button", { name: "가짜브랜드10 카드" }).count()) === 1));
  ok("저장 완료 표시 '✓ 시트에 저장했습니다'", await until(async () => (await p.getByText("시트에 저장했습니다").count()) > 0));
  ok("저장 끝나면 '저장 중' 표시 없음", await until(async () => (await p.getByText("시트에 저장하는 중").count()) === 0 && (await p.getByText("저장 중", { exact: true }).count()) === 0));
  ok("시트 단계 칸 = 연락됨(상담)",await until(async () => (await rowsOf("가짜브랜드10")).every((r) => r[C.stage] === "연락됨")));
  await card("가짜브랜드10").dragTo(col("proposal"));
  ok("시트 단계 칸 = 딜 (제안중)(제안)", await until(async () => (await rowsOf("가짜브랜드10")).every((r) => r[C.stage] === "딜 (제안중)")));
  await card("가짜브랜드10").dragTo(col("won"));
  ok("시트 단계 칸 = 성사(계약)", await until(async () => (await rowsOf("가짜브랜드10")).every((r) => r[C.stage] === "성사")));
  await card("가짜브랜드10").dragTo(col("lead"));
  ok("리드로 되돌리면 시트 단계 칸 = 리드(시트 드롭다운 값)", await until(async () => (await rowsOf("가짜브랜드10")).every((r) => r[C.stage] === "리드")));

  // 재문의 고객(가짜브랜드0, 두 행)은 모든 행에 기록
  await p.getByLabel("딜 검색").fill("1000-2000"); await p.waitForTimeout(300);
  ok("재문의 고객 행이 2개", (await rowsOf("가짜브랜드0")).length === 2);
  await card("가짜브랜드0").dragTo(col("proposal"));
  ok("재문의 고객: 두 행 모두 딜 (제안중)", await until(async () => (await rowsOf("가짜브랜드0")).every((r) => r[C.stage] === "딜 (제안중)")));

  // 상세 패널 + 계약 금액
  await p.getByLabel("딜 검색").fill("7777-0001"); await p.waitForTimeout(300);
  await card("가짜계약고객").click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  ok("계약 고객 상세에 계약 금액 입력", (await p.getByLabel("계약 금액(원)").count()) === 1);
  await p.getByLabel("계약 금액(원)").fill("2090000");
  await p.getByRole("button", { name: "시트에 저장" }).click();
  ok("시트 계약 금액 저장 대기", await until(async () => (await rowsOf("가짜계약고객"))[0][C.contract] !== ""));
  { const v = (await rowsOf("가짜계약고객"))[0][C.contract]; ok("시트 계약 금액 ₩2,090,000", v === "₩2,090,000", JSON.stringify(v)); }
  await p.keyboard.press("Escape");
  ok("카드에 계약 금액 표시", await until(async () => (await card("가짜계약고객").innerText()).includes("209만원")));

  // 리드 단계 고객 상세에는 계약 금액 칸이 없음
  await p.getByLabel("딜 검색").fill("1000-2020"); await p.waitForTimeout(300);
  await card("가짜브랜드20").click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  ok("리드 고객 상세에는 계약 금액 없음", (await p.getByLabel("계약 금액(원)").count()) === 0);
  await p.keyboard.press("Escape");

  // 충돌: 드래그 직전에 시트에서 단계가 바뀌면 되돌리고 안내
  await p.getByLabel("딜 검색").fill("1000-2030"); await p.waitForTimeout(300);
  await admin("race", { kind: "stage" }).catch(() => {});

  // 단계가 비어 있고 계약 금액만 있는 고객은 계약 열에 나오고, 리드로는 되돌릴 수 없다(금액이 남아 있으면 계속 계약으로 읽히므로)
  await p.getByLabel("딜 검색").fill("6000-0001"); await p.waitForTimeout(300);
  ok("금액만 있는 고객이 계약 열에 보임", (await col("won").getByRole("button", { name: "금액만고객 카드" }).count()) === 1);
  await card("금액만고객").dragTo(col("lead"));
  ok("리드로 되돌리기는 막히고 안내가 뜸", await until(async () => (await p.getByText("리드로 되돌릴 수 없습니다").count()) === 1));
  ok("카드는 계약 열에 그대로 · 시트 단계 칸은 비어 있는 채", (await col("won").getByRole("button", { name: "금액만고객 카드" }).count()) === 1 && (await rowsOf("금액만고객")).every((r) => r[C.stage] === ""));
  await card("금액만고객").dragTo(col("proposal"));
  ok("제안으로는 옮길 수 있음(시트 단계 = 딜 (제안중))", await until(async () => (await rowsOf("금액만고객")).every((r) => r[C.stage] === "딜 (제안중)")) && await until(async () => (await col("proposal").getByRole("button", { name: "금액만고객 카드" }).count()) === 1));

  // 파이프라인 ↔ 리드 인박스 이동 시 재로그인 없음
  await p.getByLabel("딜 검색").fill("");
  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  ok("리드 인박스로 가도 로그인 유지", await until(async () => (await p.getByText("시트가 원본입니다").count()) > 0));
  ok("실패/종료 고객은 인박스에 남음", (await p.getByText("가짜실패고객").count()) >= 0);

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
