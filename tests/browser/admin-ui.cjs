// 관리자 구분: 관리자(Connor)는 별도 관리자 비밀번호로만 들어가고, 일반 영업(Ian)은 본인 월 목표만 바꿀 수 있다.
// 서버가 팀 공용 설정 변경을 검사하고(403 admin_only), 화면은 일반 영업에게 읽기 전용으로 보여 준다.
// 이 시험은 LEADS_ADMINS=김세현(Connor) · LEADS_ADMIN_PASSCODE=admin-pass 로 서버를 띄워서 돌린다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const CON = "김세현(Connor)", IAN = "이익재(Ian)";

(async () => {
  const b = await chromium.launch();
  const until = async (p, fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const H = { origin: BASE };
  const login = (ctx, name, passcode) => ctx.request.post(`${BASE}/api/leads/session`, { headers: H, data: { name, passcode } });
  const session = async (ctx) => (await ctx.request.get(`${BASE}/api/leads/session`)).json();
  const cfg = async (ctx) => (await (await ctx.request.get(`${BASE}/api/leads/workspace-config`)).json());
  const put = (ctx, config, baseVersion) => ctx.request.put(`${BASE}/api/leads/workspace-config`, { headers: H, data: { config, baseVersion } });

  // 1) 로그인 규칙
  const anon = await b.newContext();
  const s0 = await session(anon);
  ok("로그인 전 안내: 관리자 이름·관리자 비밀번호 설정 여부", s0.configured === true && s0.admins.join() === CON && s0.adminProtected === true && s0.admin === false, JSON.stringify(s0));
  const cCon = await b.newContext(), cIan = await b.newContext();
  ok("관리자 이름은 공용 비밀번호로 들어갈 수 없음(401)", (await login(cCon, CON, "lead-pass")).status() === 401);
  ok("관리자 이름 + 관리자 비밀번호로 로그인", (await login(cCon, CON, "admin-pass")).ok());
  ok("일반 영업은 관리자 비밀번호로 들어갈 수 없음(401)", (await login(cIan, IAN, "admin-pass")).status() === 401);
  ok("일반 영업은 공용 비밀번호로 로그인", (await login(cIan, IAN, "lead-pass")).ok());
  ok("세션: Connor는 관리자, Ian은 아님", (await session(cCon)).admin === true && (await session(cIan)).admin === false && (await session(cCon)).user === CON && (await session(cIan)).user === IAN);
  ok("팀 설정 조회 응답에 관리자 여부", (await cfg(cCon)).admin === true && (await cfg(cIan)).admin === false && (await cfg(cIan)).user === IAN);

  // 2) 서버 규칙: 일반 영업은 본인 월 목표만 바꿀 수 있다
  const own = (cfgNow, rep, amount) => ({ ...cfgNow, targets: { ...cfgNow.targets, [rep]: amount } });
  const denied = await put(cIan, { version: 1, menus: { hidden: [], order: {} } }, 0);
  ok("Ian이 메뉴 설정을 바꾸려 하면 403 admin_only", denied.status() === 403 && (await denied.json()).error === "admin_only", String(denied.status()));
  ok("거절된 뒤에도 서버에는 아무것도 저장되지 않음", (await cfg(cIan)).doc === null);
  const mine = await put(cIan, { version: 1, targets: { [IAN]: 5_000_000 } }, 0);
  ok("Ian이 본인 월 목표만 바꾸면 저장됨(버전 1)", mine.ok() && (await mine.json()).doc.version === 1 && (await cfg(cIan)).doc.config.targets[IAN] === 5_000_000, String(mine.status()));
  let doc = (await cfg(cIan)).doc;
  const others = await put(cIan, own(doc.config, CON, 3_000_000), doc.version);
  ok("Ian이 Connor의 목표를 바꾸려 하면 403", others.status() === 403, String(others.status()));
  const home = await put(cIan, { ...own(doc.config, IAN, 6_000_000), home: doc.config.home.map((w) => (w.id === "status" ? { ...w, hidden: true } : w)) }, doc.version);
  ok("본인 목표와 홈 카드를 같이 바꾸면 403(관리자 설정이 섞여 있음)", home.status() === 403 && (await cfg(cIan)).doc.config.targets[IAN] === 5_000_000);
  const mine2 = await put(cIan, own(doc.config, IAN, 7_000_000), doc.version);
  ok("본인 목표를 다시 바꾸는 건 가능(버전 2)", mine2.ok() && (await mine2.json()).doc.version === 2);
  const clear = await put(cIan, { ...doc.config, targets: {} }, 2);
  ok("본인 목표를 지우는 것도 가능", clear.ok() && !(IAN in (await cfg(cIan)).doc.config.targets), String(clear.status()));
  doc = (await cfg(cCon)).doc;
  const adminEdit = await put(cCon, { ...own(doc.config, IAN, 9_000_000), leadsSince: "2026-10-01", home: doc.config.home.map((w) => (w.id === "status" ? { ...w, hidden: true } : w)) }, doc.version);
  ok("관리자는 홈 카드·기준일·다른 사람의 목표를 한꺼번에 바꿀 수 있음", adminEdit.ok(), String(adminEdit.status()));
  doc = (await cfg(cIan)).doc;
  ok("저장 결과: Ian 목표 9,000,000 · 기준일 · 영업 현황 숨김 · 수정자 Connor", doc.config.targets[IAN] === 9_000_000 && doc.config.leadsSince === "2026-10-01" && doc.config.home.find((w) => w.id === "status").hidden === true && doc.updatedBy === CON);
  const stale = await put(cIan, own(doc.config, IAN, 1_000_000), 1);
  ok("오래된 버전은 여전히 409(충돌 처리 그대로)", stale.status() === 409);
  const anonPut = await put(anon, { version: 1 }, 0);
  ok("로그인 없이는 쓰기 불가(401/403)", [401, 403].includes(anonPut.status()));

  // 3) 화면: 일반 영업은 읽기 전용, 본인 목표만 입력 가능
  const mk = async (name, pass) => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name }).click();
    return { ctx, p, pass };
  };
  const submit = async ({ p, pass }) => { await p.getByLabel("리드 화면 비밀번호").fill(pass); await p.getByRole("button", { name: "들어가기" }).click(); };
  const I = await mk(IAN, "lead-pass");
  ok("로그인 화면: 일반 영업 이름이면 '비밀번호'", (await I.p.getByText("비밀번호", { exact: true }).count()) === 1 && (await I.p.getByText("관리자 비밀번호", { exact: true }).count()) === 0);
  await I.p.getByRole("combobox", { name: "내 이름" }).click(); await I.p.getByRole("option", { name: CON }).click();
  ok("로그인 화면: 관리자 이름을 고르면 '관리자 비밀번호' 안내", await until(I.p, async () => (await I.p.getByText("관리자 비밀번호", { exact: true }).count()) === 1) && (await I.p.getByText("관리자는 공용 비밀번호가 아니라").count()) === 1);
  await submit({ p: I.p, pass: "lead-pass" }); // Ian이 Connor 이름으로 공용 비밀번호를 넣어 봄
  ok("관리자 이름 + 공용 비밀번호는 화면에서도 거절", await until(I.p, async () => (await I.p.getByText("비밀번호가 맞지 않습니다").count()) === 1));
  await I.p.getByRole("combobox", { name: "내 이름" }).click(); await I.p.getByRole("option", { name: IAN }).click();
  await submit(I);
  await I.p.waitForSelector("[data-widget]");

  const card = (p) => p.getByRole("region", { name: "월 목표 달성률" });
  await card(I.p).waitFor();
  ok("Ian 화면: 내 목표 칸은 입력 가능 · Connor 목표 칸은 잠김", await until(I.p, async () => (await card(I.p).getByLabel("이익재 월 목표(만원)").isEnabled()) && (await card(I.p).getByLabel("김세현 월 목표(만원)").isDisabled())));
  ok("Connor 목표 칸에 '관리자만' 안내(툴팁)", (await card(I.p).getByLabel("김세현 월 목표(만원)").getAttribute("title")) === "다른 사람의 목표는 관리자만 바꿀 수 있습니다");
  ok("Ian 화면에 관리자가 정한 목표(900만원)가 보임", await until(I.p, async () => (await card(I.p).getByLabel("이익재 월 목표(만원)").inputValue()) === "900"));
  const ianIn = card(I.p).getByLabel("이익재 월 목표(만원)");
  await ianIn.fill("1200"); await ianIn.press("Enter");
  ok("Ian이 본인 목표를 입력하면 서버에 저장됨(1,200만원)", await until(I.p, async () => (await cfg(cIan)).doc.config.targets[IAN] === 12_000_000), JSON.stringify((await cfg(cIan)).doc.config.targets));

  await I.p.getByRole("button", { name: "화면 설정" }).click();
  const dlg = I.p.getByRole("dialog", { name: "화면 설정" });
  await dlg.waitFor();
  ok("Ian의 화면 설정: '관리자만 바꿀 수 있습니다' 안내", await until(I.p, async () => (await dlg.getByRole("note", { name: "관리자 전용" }).count()) === 1));
  await I.p.getByRole("tab", { name: "홈 카드" }).click();
  ok("Ian의 화면 설정: 홈 카드 체크박스·되돌리기 버튼이 잠김", (await dlg.getByRole("checkbox", { name: "영업 현황 표시" }).isDisabled()) && (await dlg.getByRole("button", { name: "기본 설정으로 되돌리기" }).isDisabled()));
  await I.p.getByRole("tab", { name: "데이터 범위" }).click();
  ok("Ian의 화면 설정: 기준일 입력이 잠김", await dlg.getByLabel("리드 기준일").isDisabled());
  await I.p.keyboard.press("Escape");

  const C = await mk(CON, "admin-pass");
  await submit(C);
  await C.p.waitForSelector("[data-widget]");
  await card(C.p).waitFor();
  ok("Connor 화면: 모든 목표 칸이 입력 가능", (await card(C.p).getByLabel("이익재 월 목표(만원)").isEnabled()) && (await card(C.p).getByLabel("김세현 월 목표(만원)").isEnabled()));
  await C.p.getByRole("button", { name: "화면 설정" }).click();
  const cd = C.p.getByRole("dialog", { name: "화면 설정" });
  await cd.waitFor();
  ok("Connor의 화면 설정: 관리자 전용 안내가 없고 체크박스가 켜져 있음", (await cd.getByRole("note", { name: "관리자 전용" }).count()) === 0);
  await C.p.getByRole("tab", { name: "홈 카드" }).click();
  await cd.getByRole("checkbox", { name: "마감 임박 표시" }).click();
  ok("Connor가 바꾼 화면 설정은 서버에 저장됨(마감 임박 숨김)", await until(C.p, async () => (await cfg(cCon)).doc.config.home.find((w) => w.id === "deadline").hidden === true));
  await C.p.keyboard.press("Escape");
  const conIn = card(C.p).getByLabel("김세현 월 목표(만원)");
  await conIn.fill("800"); await conIn.press("Enter");
  ok("Connor는 본인 목표도 저장함(800만원)", await until(C.p, async () => (await cfg(cCon)).doc.config.targets[CON] === 8_000_000));
  ok("Ian 화면이 다시 불러오면 Connor의 목표·설정이 보임(읽기 전용으로)", await (async () => { await I.p.evaluate(() => window.dispatchEvent(new Event("focus"))); return until(I.p, async () => (await card(I.p).getByLabel("김세현 월 목표(만원)").inputValue()) === "800" && (await I.p.locator('[data-widget="deadline"]').count()) === 0); })());

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
