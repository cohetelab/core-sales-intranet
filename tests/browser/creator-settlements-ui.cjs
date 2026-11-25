// 크리에이터 정산 화면의 마진율: 요약 카드 · 캠페인별 정산금액 · 정산 목록의 건별 마진율. 순수익 = 계약대금 − 지급 예정액, 마진율 = 순수익 ÷ 계약대금.
// 이 화면은 브라우저 저장소(localStorage)에 저장하므로 시트·서버 없이 저장소를 직접 채워서 확인한다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

const REC = (id, creatorName, campaignName, amount, contractAmount, status = "pending") => ({
  id, creatorName, campaignName, resultUrl: "", amount, note: "", status, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
  ...(contractAmount === undefined ? {} : { contractAmount }),
});
// 캠페인가: a(지급 800,000 · 계약대금 2,000,000 = 60%) · b(600,000 · 1,000,000 = 40%) · c(500,000 · 계약대금 없음)
// 캠페인나: d(지급 1,000,000 · 계약대금 800,000 = -25% 손실)
const RECORDS = [REC("r1", "creator_a", "캠페인가", 800000, 2000000), REC("r2", "creator_b", "캠페인가", 600000, 1000000, "completed"), REC("r3", "creator_c", "캠페인가", 500000, undefined), REC("r4", "creator_d", "캠페인나", 1000000, 800000)];

(async () => {
  const b = await chromium.launch();
  const mk = async (records) => {
    const ctx = await b.newContext({ viewport: { width: 1700, height: 1500 } });
    // 처음 한 번만 채운다(수정한 값이 새로고침 때 덮이지 않게). 캠페인 샘플이 섞이지 않게 캠페인 저장소는 비운다.
    await ctx.addInitScript((recs) => {
      if (!localStorage.getItem("__seeded")) {
        localStorage.setItem("core-sales-campaigns-v1", "[]");
        localStorage.setItem("core-sales-creator-settlements-v1", JSON.stringify(recs));
        localStorage.setItem("__seeded", "1");
      }
    }, records);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(`${BASE}/creator-settlements`, { waitUntil: "networkidle" });
    return { ctx, p, errs };
  };
  const until = async (p, fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const norm = (s) => s.replace(/\s+/g, " ").trim();

  const { p, errs } = await mk(RECORDS);
  await p.getByRole("heading", { name: "캠페인별 정산금액" }).waitFor({ timeout: 30000 });
  const statCard = () => p.locator("[data-slot='card']").filter({ hasText: "순수익 ÷ 계약대금" });
  const group = (name) => p.getByRole("button", { name: new RegExp(`^${name}`) });
  const rowOf = (name) => p.locator("tbody tr").filter({ hasText: name });

  // 1) 요약 카드
  ok("요약 카드에 '마진율' 36.8% (순수익 1,400,000 ÷ 계약대금 3,800,000)", await until(p, async () => (await statCard().count()) === 1 && norm(await statCard().innerText()).includes("36.8%")), norm(await statCard().innerText()));
  ok("요약 카드 설명: 계약대금 합계와 입력 건수(3/4건)", norm(await statCard().innerText()).includes("3,800,000원") && norm(await statCard().innerText()).includes("3/4건"));
  ok("순수익 카드는 그대로(1,400,000원 · 3/4건)", (await p.locator("[data-slot='card']").filter({ hasText: "기타 비용 제외" }).innerText()).replace(/\s+/g, " ").includes("1,400,000원"));

  // 2) 캠페인별
  const g1 = norm(await group("캠페인가").innerText());
  const g2 = norm(await group("캠페인나").innerText());
  ok("캠페인가: 마진율 53.3% · 2/3건 (순수익 1,600,000 ÷ 계약대금 3,000,000)", g1.includes("마진율 · 2/3건") && g1.includes("53.3%") && g1.includes("1,600,000원"), g1);
  ok("캠페인나: 손실이라 -25%", g2.includes("-25%") && g2.includes("마진율 · 1/1건"), g2);
  ok("손실 마진율은 빨간색(text-destructive) 표시", (await group("캠페인나").getByTestId("campaign-margin").getAttribute("class")).includes("text-destructive") && !(await group("캠페인가").getByTestId("campaign-margin").getAttribute("class")).includes("text-destructive"));

  // 3) 정산 목록: 건별
  const m = async (name) => norm(await rowOf(name).getByTestId("row-margin").innerText());
  ok("건별 마진율: a 60% · b 40% · c 계약대금 없음 — · d -25%", (await m("creator_a")) === "60%" && (await m("creator_b")) === "40%" && (await m("creator_c")) === "—" && (await m("creator_d")) === "-25%", [await m("creator_a"), await m("creator_b"), await m("creator_c"), await m("creator_d")].join(" | "));
  ok("정산 목록 머리글에 '마진율' 열", norm(await p.locator("thead").innerText()).includes("마진율"));

  // 4) 캠페인을 눌러 거르면 목록은 그 캠페인만, 요약은 그대로
  await group("캠페인나").click();
  ok("캠페인나로 거르면 목록은 d 한 건", (await p.locator("tbody tr").count()) === 1 && (await m("creator_d")) === "-25%");
  await p.getByRole("button", { name: "전체 보기" }).click();
  ok("전체 보기로 돌아오면 4건", (await p.locator("tbody tr").count()) === 4);

  // 5) 계약대금을 입력하면 다시 계산
  await p.getByRole("button", { name: "creator_c 계약대금 입력" }).click();
  await p.locator("#contract-amount").fill("700000");
  await p.getByRole("button", { name: "금액 저장" }).click();
  ok("c에 계약대금 700,000 입력 → 건별 28.6% (순수익 200,000 ÷ 700,000)", await until(p, async () => (await m("creator_c")) === "28.6%"), await m("creator_c"));
  ok("요약 마진율 35.6% (순수익 1,600,000 ÷ 계약대금 4,500,000) · 4/4건", await until(p, async () => norm(await statCard().innerText()).includes("35.6%")) && norm(await statCard().innerText()).includes("4/4건"), norm(await statCard().innerText()));
  ok("캠페인가 48.6% · 3/3건 (순수익 1,800,000 ÷ 계약대금 3,700,000)", norm(await group("캠페인가").innerText()).includes("48.6%") && norm(await group("캠페인가").innerText()).includes("3/3건"), norm(await group("캠페인가").innerText()));
  // 계약대금을 지우면 그 건은 다시 계산에서 빠진다
  await p.getByRole("button", { name: "creator_c 계약대금 수정" }).click();
  await p.locator("#contract-amount").fill("");
  await p.getByRole("button", { name: "금액 저장" }).click();
  ok("계약대금을 비우면 다시 — 이고 요약도 36.8%로 복귀", await until(p, async () => (await m("creator_c")) === "—" && norm(await statCard().innerText()).includes("36.8%")));
  // 계약대금 0원: 0으로 나누지 않는다
  await p.getByRole("button", { name: "creator_c 계약대금 입력" }).click();
  await p.locator("#contract-amount").fill("0");
  await p.getByRole("button", { name: "금액 저장" }).click();
  ok("계약대금 0원이면 건별 마진율은 계산하지 않음(—) · 오류 없음", await until(p, async () => (await m("creator_c")) === "—") && errs.length === 0, errs.join(" | "));
  ok("계약대금 0원 건의 지급액(-500,000)은 순수익에는 들어감: 요약 마진율 = 900,000 ÷ 3,800,000 = 23.7%", await until(p, async () => norm(await statCard().innerText()).includes("23.7%")), norm(await statCard().innerText()));

  // 6) 계약대금을 하나도 입력하지 않은 경우
  const E = await mk([REC("e1", "creator_x", "캠페인다", 300000, undefined)]);
  await E.p.getByRole("heading", { name: "캠페인별 정산금액" }).waitFor({ timeout: 30000 });
  const ec = E.p.locator("[data-slot='card']").filter({ hasText: "계약대금을 입력하면 계산됩니다" });
  ok("계약대금이 하나도 없으면 마진율 — + '계약대금을 입력하면 계산됩니다'", (await ec.count()) === 1 && norm(await ec.innerText()).includes("—"), await ec.count().then(String));
  ok("그 캠페인 줄도 마진율 — · 0/1건", norm(await E.p.getByRole("button", { name: /^캠페인다/ }).innerText()).includes("마진율 · 0/1건") && norm(await E.p.getByRole("button", { name: /^캠페인다/ }).innerText()).includes("—"));
  ok("화면 오류 없음", E.errs.length === 0, E.errs.join(" | "));

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
