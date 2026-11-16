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

async function login(ctx, name) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: name }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");
  return p;
}

(async () => {
  const now = Date.now();
  const A = (cells) => admin("append", { cells: { 5: "영상 제작", 6: "홈페이지", ...cells } });
  await A({ 0: stamp(now - 3 * D), 1: "내것리드", 2: "010-7500-0001", 10: "김세현(Connor)" });
  await A({ 0: stamp(now - 5 * D), 1: "내것상담", 2: "010-7500-0002", 4: "상담", 10: "김세현(Connor)", 13: sd(now - 1 * D), 15: "내 견적 발송" });
  await A({ 0: stamp(now - 5 * D), 1: "남의것상담", 2: "010-7500-0003", 4: "상담", 10: "이익재(Ian)", 13: sd(now - 1 * D), 15: "남의 견적 발송" });
  await A({ 0: stamp(now - 2 * D), 1: "남의것리드", 2: "010-7500-0004", 10: "이익재(Ian)" });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1300 } });
  const errs = [];
  const p = await login(ctx, "김세현(Connor)");
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (pg, fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await pg.waitForTimeout(250); } return false; };
  const grp = (pg) => pg.getByRole("group", { name: "담당 필터" });
  const mineBtn = (pg) => grp(pg).getByRole("button", { name: /^내 리드만/ });
  const pressed = async (pg) => (await mineBtn(pg).getAttribute("aria-pressed")) === "true";

  // 1) 리드 인박스
  ok("기본은 꺼져 있음(전체 보기)", !(await pressed(p)));
  const connorCount = Number((await mineBtn(p).innerText()).trim().split(/\s+/).pop());
  ok("'내 리드만' 버튼에 내 건수가 보임", connorCount >= 1, String(connorCount));
  await mineBtn(p).click();
  await p.waitForTimeout(400);
  ok("켜면 내 담당 칩도 눌린 상태", await pressed(p) && (await grp(p).getByRole("button", { name: /^김세현\(Connor\)/ }).getAttribute("aria-pressed")) === "true");
  const rows = await p.locator("tbody tr").allInnerTexts();
  ok("표에 내 리드만(남의 리드 없음)", rows.length === connorCount && rows.some((t) => t.includes("내것리드")) && !rows.some((t) => t.includes("남의것리드")), `${rows.length}건`);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  ok("새로고침해도 켜진 채로 유지(이 브라우저에 기억)", await until(p, () => pressed(p)));
  ok("유지된 상태에서도 남의 리드는 안 보임", !(await p.locator("tbody tr").allInnerTexts()).some((t) => t.includes("남의것리드")));

  // 2) 파이프라인
  await p.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  ok("파이프라인에도 '내 리드만'이 켜진 채로 적용", await until(p, () => pressed(p)));
  ok("파이프라인: 내 카드만 보임", (await p.getByRole("button", { name: "내것상담 카드" }).count()) === 1 && (await p.getByRole("button", { name: "남의것상담 카드" }).count()) === 0 && (await p.getByRole("button", { name: "남의것리드 카드" }).count()) === 0);

  // 3) 홈
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  ok("홈: 제목이 'OO님의 오늘 업무'", await until(p, async () => (await p.getByRole("heading", { name: "김세현님의 오늘 업무" }).count()) === 1));
  let t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  ok("홈 일정: 내 일정만(남의 일정 없음)", t.includes("내것상담 · 내 견적 발송") && !t.includes("남의것상담"));
  await p.getByRole("button", { name: /^내 리드만/ }).click();
  await p.waitForTimeout(300);
  t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  ok("끄면 전체 일정과 '오늘의 업무' 제목으로 돌아옴", t.includes("남의것상담 · 남의 견적 발송") && t.includes("내것상담 · 내 견적 발송") && (await p.getByRole("heading", { name: "오늘의 업무" }).count()) === 1);

  // 4) 다른 담당 칩을 누르면 꺼진다
  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  ok("홈에서 끄면 리드 인박스도 꺼진 상태", !(await pressed(p)));
  await mineBtn(p).click();
  await grp(p).getByRole("button", { name: /^이익재\(Ian\)/ }).click();
  await p.waitForTimeout(300);
  ok("다른 사람 칩을 누르면 '내 리드만'이 꺼지고 그 사람 리드가 보임", !(await pressed(p)) && (await p.locator("tbody tr").allInnerTexts()).every((r) => r.includes("이익재(Ian)")));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  ok("새로고침 후에도 꺼진 상태(기억도 지워짐)", !(await pressed(p)));

  // 5) 다른 영업은 자기 것만
  const ctx2 = await b.newContext({ viewport: { width: 1600, height: 1300 } });
  const p2 = await login(ctx2, "이익재(Ian)");
  ok("Ian으로 로그인하면 기본은 꺼져 있음(브라우저별 기억)", !(await pressed(p2)));
  await mineBtn(p2).click();
  await p2.waitForTimeout(400);
  const rows2 = await p2.locator("tbody tr").allInnerTexts();
  ok("Ian: 내 리드만 → Ian 리드만, Connor 리드는 안 보임", rows2.some((r) => r.includes("남의것리드")) && !rows2.some((r) => r.includes("내것리드")));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: out("mine.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
