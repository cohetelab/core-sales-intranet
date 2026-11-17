// 팀 공용 화면 설정: 서버 저장, 다른 사람 화면에 반영, 동시에 바꿨을 때 합치기, 되돌리기, 로그인 전 상태.
// 서버 저장소는 테스트에서 WORKSPACE_CONFIG_FILE(파일)로 대신한다(운영에서는 Supabase Storage).
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } }); return { ctx, p: await ctx.newPage() }; };
  const login = async ({ p }, name) => {
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name }).click();
    await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
    await p.waitForSelector("[data-widget]");
  };
  const doc = async ({ ctx }) => (await (await ctx.request.get(`${BASE}/api/leads/workspace-config`)).json()).doc;
  const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
  const order = (p) => p.locator("[data-widget]").evaluateAll((els) => els.map((e) => e.getAttribute("data-widget")));
  const dialog = (p) => p.getByRole("dialog", { name: "화면 설정" });
  const status = (p) => dialog(p).getByRole("status", { name: "저장 상태" });
  const hasHidden = (d, id) => d && d.config.home.find((w) => w.id === id).hidden === true;

  // 1) 로그인 전: 서버 설정은 읽지도 쓰지도 못한다
  const anon = await b.newContext();
  const g = await anon.request.get(`${BASE}/api/leads/workspace-config`);
  const put = await anon.request.put(`${BASE}/api/leads/workspace-config`, { data: { config: { version: 1 }, baseVersion: 0 } });
  ok("로그인 전: 읽기 401 · 쓰기 거부(401/403)", g.status() === 401 && [401, 403].includes(put.status()), `${g.status()}/${put.status()}`);
  await anon.close();

  // 2) Connor 로그인: 아직 저장된 적 없는 팀 설정
  const A = await mk();
  await login(A, "김세현(Connor)");
  ok("서버에 아직 팀 설정이 없음", (await doc(A)) === null);
  await A.p.getByRole("button", { name: "화면 편집" }).click(); await dialog(A.p).waitFor();
  ok("상태: 팀 공용 설정 · 아직 저장된 적 없음(기본 구성)", await until(async () => (await status(A.p).innerText()).includes("아직 저장된 적이 없어 기본 구성")), await status(A.p).innerText());
  ok("안내: 바꾸면 모든 팀원의 화면에 적용", (await dialog(A.p).innerText()).includes("바꾸면 모든 팀원의 화면에 적용됩니다"));

  // 3) 바꾸면 서버에 저장된다
  await dialog(A.p).getByRole("checkbox", { name: "영업 현황 표시" }).click();
  ok("서버에 저장됨: 버전 1 · 수정자 Connor · 영업 현황 숨김", await until(async () => { const d = await doc(A); return d && d.version === 1 && d.updatedBy === "김세현(Connor)" && hasHidden(d, "status"); }));
  ok("상태 문구: 저장됨(마지막 수정 김세현)", await until(async () => /저장됨 \(마지막 수정 김세현/.test(await status(A.p).innerText())), await status(A.p).innerText());
  await A.p.keyboard.press("Escape");

  // 4) 다른 사람(Ian)은 로그인하면 바로 그 설정을 본다
  const B = await mk();
  await login(B, "이익재(Ian)");
  ok("Ian의 홈에도 영업 현황이 없음(팀 설정이 적용됨)", await until(async () => !(await order(B.p)).includes("status")), (await order(B.p)).join());
  ok("Ian도 기본 숨김(샘플 메뉴)은 그대로: 사이드바 '영업' 메뉴에 팀이 없음", await (async () => { await B.p.getByRole("navigation", { name: "대분류" }).getByRole("button", { name: /^영업/ }).click(); return (await B.p.locator('[data-slot="sidebar"]').getByRole("link", { name: "팀", exact: true }).count()) === 0; })());

  // 5) Ian이 바꾸면 Connor 화면에도 반영(창으로 돌아올 때 다시 불러옴)
  await B.p.getByRole("button", { name: "화면 설정" }).click(); await dialog(B.p).waitFor();
  await B.p.getByRole("tab", { name: "사이드바 메뉴" }).click();
  await dialog(B.p).getByRole("checkbox", { name: "팀 표시" }).click(); // 숨김 해제
  ok("서버: 버전 2 · 수정자 Ian · 팀 메뉴 표시", await until(async () => { const d = await doc(B); return d && d.version === 2 && d.updatedBy === "이익재(Ian)" && !d.config.menus.hidden.includes("/team"); }));
  await B.p.keyboard.press("Escape");
  await A.p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await A.p.getByRole("navigation", { name: "대분류" }).getByRole("button", { name: /^영업/ }).click();
  ok("Connor 화면 사이드바에 팀이 나타남(다시 불러옴)", await until(async () => (await A.p.locator('[data-slot="sidebar"]').getByRole("link", { name: "팀", exact: true }).count()) === 1));

  // 6) 동시에 바꾸기: Ian의 저장을 붙잡아 두고 Connor가 먼저 저장 → Ian의 변경이 최신 위에 다시 적용돼 둘 다 남는다
  let release;
  const held = new Promise((r) => (release = r));
  await B.p.route("**/api/leads/workspace-config", async (route) => { if (route.request().method() === "PUT") await held; await route.continue(); });
  await B.p.getByRole("button", { name: "화면 설정" }).click(); await dialog(B.p).waitFor();
  await B.p.getByRole("tab", { name: "홈 카드" }).click();
  await dialog(B.p).getByRole("checkbox", { name: "마감 임박 표시" }).click(); // Ian: 마감 임박 끔(저장 대기)
  await B.p.waitForTimeout(1500);
  await A.p.getByRole("button", { name: "화면 편집" }).click(); await dialog(A.p).waitFor();
  await dialog(A.p).getByRole("checkbox", { name: "월별 문의 표시" }).click(); // Connor: 월별 문의 끔(먼저 저장)
  ok("Connor의 저장이 먼저 반영(버전 3)", await until(async () => { const d = await doc(A); return d && d.version === 3 && hasHidden(d, "months") && !hasHidden(d, "deadline"); }));
  release();
  ok("Ian 저장은 충돌 후 최신 위에 다시 적용: 마감 임박·월별 문의 둘 다 숨김(버전 4)", await until(async () => { const d = await doc(A); return d && d.version === 4 && hasHidden(d, "months") && hasHidden(d, "deadline") && hasHidden(d, "status"); }, 20000), JSON.stringify((await doc(A)).config.home.filter((w) => w.hidden).map((w) => w.id)));
  ok("Ian 화면도 두 변경이 모두 반영된 최종 상태", await until(async () => { const o = await order(B.p); return !o.includes("months") && !o.includes("deadline"); }));
  await A.p.keyboard.press("Escape");
  await B.p.keyboard.press("Escape");

  // 7) 되돌리기도 팀 전체에 적용
  await A.p.getByRole("button", { name: "화면 편집" }).click(); await dialog(A.p).waitFor();
  await dialog(A.p).getByRole("button", { name: "기본 설정으로 되돌리기" }).click();
  ok("서버: 기본 구성으로 저장(숨김 카드 없음)", await until(async () => { const d = await doc(A); return d && d.version === 5 && d.config.home.every((w) => !w.hidden); }));
  await B.p.evaluate(() => window.dispatchEvent(new Event("focus")));
  ok("Ian 화면도 기본 구성으로 복귀", await until(async () => (await order(B.p)).length >= 10 && (await order(B.p)).includes("status") && (await order(B.p)).includes("months")));

  // 8) 저장된 설정이 깨져도 기본값으로 읽힘(서버가 다시 검증)
  const cur = (await doc(A)).version;
  const bad = await A.ctx.request.put(`${BASE}/api/leads/workspace-config`, { headers: { origin: BASE }, data: { config: { version: 1, menus: { hidden: ["/", "/leads"], order: "깨짐" }, home: [{ id: "없는카드", width: 4 }] }, baseVersion: cur } });
  const badDoc = (await bad.json()).doc;
  ok("서버가 모양을 검증: 대시보드는 숨김에서 빠지고 모르는 카드는 버려지며 빠진 카드는 채워짐", bad.ok() && !badDoc.config.menus.hidden.includes("/") && badDoc.config.menus.hidden.includes("/leads") && badDoc.config.home.length === 11 && !badDoc.config.home.some((w) => w.id === "없는카드"));
  const wrong = await A.ctx.request.put(`${BASE}/api/leads/workspace-config`, { headers: { origin: BASE }, data: { config: { version: 2 }, baseVersion: cur + 1 } });
  const conflict = await A.ctx.request.put(`${BASE}/api/leads/workspace-config`, { headers: { origin: BASE }, data: { config: { version: 1 }, baseVersion: 1 } });
  ok("잘못된 문서는 400, 오래된 baseVersion은 409(최신 문서 함께)", wrong.status() === 400 && conflict.status() === 409 && (await conflict.json()).doc.version === cur + 1, `${wrong.status()}/${conflict.status()}`);

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
