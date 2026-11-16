const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
const local = process.argv[2] === "local";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1600, 1000], [1200, 900], [900, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
    if (!local) {
      await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
      await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
      await p.waitForSelector("text=시트가 원본입니다");
    }
    const board = p.getByRole("region", { name: "파이프라인 칸반" });
    await board.waitFor();
    const m = await board.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }));
    const pageOverflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const tag = `[${w}px]`;
    ok(`${tag} 칸반 영역이 가로 스크롤 가능한 상자`, m.ox === "auto" || m.ox === "scroll", JSON.stringify(m));
    ok(`${tag} 페이지 전체가 옆으로 밀리지 않음`, pageOverflow <= 1, String(pageOverflow));
    ok(`${tag} 4개 열이 모두 존재`, (await p.locator("[data-stage]").count()) === 4 || local);
    const needsScroll = m.sw > m.cw + 1;
    if (w <= 1200) ok(`${tag} 좁은 화면에서는 칸반이 실제로 넘침(스크롤 필요)`, needsScroll, `${m.sw} > ${m.cw}`);
    if (needsScroll) {
      await board.evaluate((el) => { el.scrollLeft = 0; });
      const first = await p.locator("[data-stage], .min-w-\\[18rem\\]").first().boundingBox();
      await board.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
      await p.waitForTimeout(300);
      const sl = await board.evaluate((el) => el.scrollLeft);
      ok(`${tag} 오른쪽 끝까지 스크롤됨`, sl > 50, String(sl));
      const lastCol = local ? p.locator(".min-w-\\[18rem\\]").last() : p.locator('[data-stage="won"]');
      const lb = await lastCol.boundingBox();
      ok(`${tag} 끝으로 가면 '계약' 열이 화면 안에 보임`, lb && lb.x >= 0 && lb.x + lb.width <= w + 2, JSON.stringify(lb));
      // 마우스 휠(가로)로도 움직임
      await board.evaluate((el) => { el.scrollLeft = 0; });
      const box = await board.boundingBox();
      await p.mouse.move(box.x + 40, box.y + 40);
      await p.mouse.wheel(400, 0);
      await p.waitForTimeout(400);
      ok(`${tag} 가로 휠로 스크롤됨`, (await board.evaluate((el) => el.scrollLeft)) > 100);
    }
    ok(`${tag} 페이지 에러 없음`, errs.length === 0, errs.join(" | "));
    if (w === 1200 || w === 390) await p.screenshot({ path: out(`kanban-${local ? "local-" : ""}${w}.png`) });
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
