const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const rail = (label) => p.getByRole("navigation", { name: "대분류" }).getByRole("button", { name: new RegExp(`^${label}`) });
  const link = (name) => p.locator('[data-slot="sidebar"]').getByRole("link", { name, exact: true }); // 사이드바 안의 메뉴만(홈 본문에도 같은 이름의 링크가 있다)
  const order = () => p.locator("[data-widget]").evaluateAll((els) => els.map((e) => e.getAttribute("data-widget")));
  const dialog = () => p.getByRole("dialog", { name: "화면 설정" });
  const openRail = async (label) => { await rail(label).click(); await p.waitForTimeout(200); };

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");
  await p.waitForSelector("[data-widget]");

  // 1) 기본: 샘플 화면은 숨김
  await openRail("캠페인");
  ok("기본: 캠페인에는 '캠페인 운영'(샘플)은 숨고 '업무 보드'만 남음", (await rail("캠페인").count()) === 1 && (await link("캠페인 운영").count()) === 0 && (await link("업무 보드").count()) === 1);
  ok("기본: 영업·정산·에이전트 대분류는 있음", (await rail("영업").count()) === 1 && (await rail("정산").count()) === 1 && (await rail("에이전트").count()) === 1);
  await openRail("영업");
  ok("기본: 영업 메뉴에 계약·견적·팀은 없고 파이프라인·리드·고객사·리포트는 있음", (await link("계약·견적").count()) === 0 && (await link("팀").count()) === 0 && (await link("딜 파이프라인").count()) === 1 && (await link("리드 인박스").count()) === 1 && (await link("고객사").count()) === 1 && (await link("리포트").count()) === 1);
  await openRail("홈");
  ok("기본: 홈 메뉴는 대시보드만(캘린더·주간 보고 숨김)", (await link("대시보드").count()) === 1 && (await link("캘린더").count()) === 0 && (await link("주간 보고").count()) === 0);
  await openRail("에이전트");
  ok("기본: 에이전트는 허브·루틴 숨김, 회의실·관리·페퍼는 보임", (await link("에이전트 허브").count()) === 0 && (await link("루틴").count()) === 0 && (await link("회의실").count()) === 1 && (await link("페퍼").count()) === 1);

  // 2) 홈 카드
  const def = await order();
  ok("기본 홈 카드 11개가 정해진 순서로 보임", def.join() === "cleanup,status,pipeline,schedule,checks,response,deadline,months,activity,community,slack", def.join());
  await p.getByRole("button", { name: "화면 편집" }).click();
  await dialog().waitFor();
  ok("화면 편집 → 설정 창이 '홈 카드' 탭으로 열림", (await dialog().getByRole("tab", { name: "홈 카드" }).getAttribute("aria-selected")) === "true" && (await dialog().getByRole("list", { name: "홈 카드 목록" }).getByRole("listitem").count()) === 11);
  ok("안내: 끄면 숨겨질 뿐이고 주소로는 열림", (await dialog().innerText()).includes("주소를 직접 열면 화면은 열립니다"));

  await dialog().getByRole("checkbox", { name: "영업 현황 표시" }).click();
  ok("영업 현황을 끄면 홈에서 사라짐", await until(async () => !(await order()).includes("status")));
  await dialog().getByRole("button", { name: "마감 임박 위로" }).click();
  await dialog().getByRole("button", { name: "마감 임박 위로" }).click();
  ok("마감 임박을 위로 2칸 → 응답 속도 앞으로", await until(async () => { const o = await order(); return o.indexOf("deadline") < o.indexOf("checks") && o.indexOf("checks") < o.indexOf("response"); }), (await order()).join());
  await dialog().getByRole("group", { name: "파이프라인 분석 너비" }).getByRole("button", { name: "전체" }).click();
  const wPipe = await p.locator('[data-widget="pipeline"]').boundingBox(), wChecks = await p.locator('[data-widget="checks"]').boundingBox();
  ok("파이프라인 분석을 '전체' 너비로 → 다른 카드보다 훨씬 넓음", wPipe.width > wChecks.width * 2.5, `${Math.round(wPipe.width)} vs ${Math.round(wChecks.width)}`);
  await p.keyboard.press("Escape");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("[data-widget]");
  const after = await order();
  ok("새로고침해도 설정이 유지됨(이 브라우저에 저장)", !after.includes("status") && after.indexOf("deadline") < after.indexOf("checks"), after.join());

  // 3) 메뉴 설정(헤더 버튼)
  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  await p.getByRole("button", { name: "화면 설정" }).click();
  await dialog().waitFor();
  ok("헤더 버튼 → 다른 화면에서는 '사이드바 메뉴' 탭으로 열림", (await dialog().getByRole("tab", { name: "사이드바 메뉴" }).getAttribute("aria-selected")) === "true");
  ok("대시보드는 항상 표시(체크박스 비활성)", await dialog().getByRole("checkbox", { name: "대시보드 표시" }).isDisabled());
  ok("샘플 메뉴에는 '샘플 데이터' 표시", (await dialog().locator("li", { hasText: "팀" }).first().innerText()).includes("샘플 데이터"));
  await dialog().getByRole("checkbox", { name: "팀 표시" }).click(); // 숨김 해제
  await dialog().getByRole("checkbox", { name: "리포트 표시" }).click(); // 숨김
  await dialog().getByRole("button", { name: "리드 인박스 위로" }).click(); // 파이프라인보다 앞으로
  await p.keyboard.press("Escape");
  await openRail("영업");
  ok("사이드바: 팀이 다시 보이고 리포트는 사라짐", (await link("팀").count()) === 1 && (await link("리포트").count()) === 0);
  const names = await p.locator("a").filter({ hasText: /^(리드 인박스|딜 파이프라인|고객사)$/ }).allInnerTexts();
  ok("사이드바 순서: 리드 인박스 → 딜 파이프라인", names.indexOf("리드 인박스") < names.indexOf("딜 파이프라인") && names.length >= 2, names.join(" > "));

  // 4) ⌘K 검색도 숨긴 메뉴를 뺀다
  await p.keyboard.press("Control+k");
  await p.waitForTimeout(400);
  const palette = p.getByRole("dialog").last();
  await palette.getByRole("textbox").fill("리포트").catch(async () => { await p.keyboard.type("리포트"); });
  await p.waitForTimeout(400);
  ok("⌘K 검색에서 숨긴 '리포트' 메뉴는 안 나옴", (await palette.getByText("리포트", { exact: true }).count()) === 0);
  await p.keyboard.press("Escape");

  // 5) 숨겨도 주소로는 열림
  await p.goto(`${BASE}/weekly`, { waitUntil: "networkidle" });
  ok("숨긴 화면도 주소로 열리고 '샘플 데이터' 안내가 보임", await p.getByRole("note").filter({ hasText: "샘플 데이터" }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false));

  // 6) 기본 설정으로 되돌리기
  await p.getByRole("button", { name: "화면 설정" }).click();
  await dialog().waitFor();
  await dialog().getByRole("button", { name: "기본 설정으로 되돌리기" }).click();
  await p.keyboard.press("Escape");
  await openRail("영업");
  ok("되돌리면 팀 숨김·리포트 표시로 복귀", (await link("팀").count()) === 0 && (await link("리포트").count()) === 1);
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.waitForSelector("[data-widget]");
  ok("홈 카드도 기본 11개·기본 순서로 복귀", (await order()).join() === def.join());

  // 7) 브라우저마다 따로(새 브라우저는 기본값)
  await p.getByRole("button", { name: "화면 편집" }).click(); await dialog().waitFor();
  await dialog().getByRole("checkbox", { name: "최근 활동 표시" }).click();
  await p.keyboard.press("Escape");
  const ctx2 = await b.newContext({ viewport: { width: 1600, height: 1400 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p2.getByRole("combobox", { name: "내 이름" }).click(); await p2.getByRole("option", { name: "이익재(Ian)" }).click();
  await p2.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p2.getByRole("button", { name: "들어가기" }).click();
  await p2.waitForSelector("[data-widget]");
  ok("다른 브라우저(다른 사람)는 내 설정과 무관하게 기본값", (await p2.locator("[data-widget]").evaluateAll((els) => els.map((e) => e.getAttribute("data-widget")))).includes("activity"));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.getByRole("button", { name: "화면 편집" }).click(); await dialog().waitFor();
  await p.screenshot({ path: out("workspace.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
