const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const kst = (add) => new Date(Date.now() + 9 * 3600 * 1000 + add * 86400000).toISOString().slice(0, 10);
const sd = (iso) => { const [y, m, d] = iso.split("-"); return `${y}. ${+m}. ${+d}.`; };
const stamp = (add) => `${kst(add)} 10:00`;

(async () => {
  // 점검 시험용 고객
  await admin("append", { cells: { 0: stamp(-40), 1: "정체상담고객", 2: "010-8888-0001", 5: "영상 제작", 6: "홈페이지", 4: "상담", 10: "이익재(Ian)", 13: sd(kst(5)) } });
  await admin("append", { cells: { 0: stamp(-3), 1: "지난일정고객", 2: "010-8888-0002", 5: "영상 제작", 6: "홈페이지", 4: "제안", 10: "김세현(Connor)", 13: sd(kst(-1)), 15: "견적 재발송" } });
  await admin("append", { cells: { 0: stamp(-5), 1: "컨택없는고객", 2: "010-8888-0003", 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)" } });
  await admin("append", { cells: { 0: stamp(-3), 1: "미배정사흘", 2: "010-8888-0005", 5: "영상 제작", 6: "홈페이지" } }); // 사흘 전 · 담당 없음 → 24시간 넘게 미배정
  await admin("append", { cells: { 0: stamp(0).replace(/ .*/, " 00:00"), 1: "방금들어온고객", 2: "010-8888-0004", 5: "영상 제작", 6: "홈페이지" } }); // 오늘 → 아직 24시간 안 됨(대체로)

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const grp = () => p.getByRole("group", { name: "오늘의 점검" });
  const n = async (label) => Number((await grp().getByRole("button", { name: new RegExp(label) }).innerText()).trim().split(/\s+/).pop().replace(/\D/g, ""));
  const total = async () => Number((await p.locator("p:has-text('총 ')").first().innerText()).match(/총 ([\d,]+)건/)[1].replace(/,/g, ""));
  const names = async () => (await p.locator("tbody tr td:nth-child(3)").allInnerTexts()).map((t) => t.trim().split("\n")[0]);

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  ok("점검 항목 5개", (await grp().getByRole("button").count()) === 5);
  ok("점검 카드에 '읽기만 하고 바꾸지 않습니다' 안내", (await p.getByText("읽기만 하고 아무것도 바꾸지 않습니다").count()) === 1);
  const un = await n("24시간 넘게 미배정");
  ok("미배정 점검은 최근 30일 문의만(옛 문의 60건은 제외 → 사흘 전 1건)", un === 1, String(un));
  ok("컨택 기록 없음 = 1(컨택없는고객)", (await n("첫 컨택 기록 없음")) === 1);
  ok("일정 지남 = 1(지난일정고객)", (await n("리터치 일정 지남")) === 1);
  ok("14일 넘게 활동 없음 ≥ 1(정체상담고객)", (await n("14일 넘게 활동 없음")) >= 1);
  ok("계약 금액 미기재 = 1(가짜계약고객)", (await n("계약 금액 미기재")) === 1);
  ok("담당별 진행 중 건수 문구", (await p.getByText(/담당별 진행 중\(계약 전\):/).count()) === 1);

  await grp().getByRole("button", { name: /첫 컨택 기록 없음/ }).click();
  ok("컨택 점검: 표에 해당 고객만(1건)", (await total()) === 1 && (await names()).join() === "컨택없는고객", (await names()).join());
  ok("점검 버튼이 눌린 상태", (await grp().getByRole("button", { name: /첫 컨택 기록 없음/ }).getAttribute("aria-pressed")) === "true");
  ok("점검 중에는 단계 열 표시(전체 단계 보기)", (await p.getByRole("columnheader", { name: "단계" }).count()) === 1);

  await grp().getByRole("button", { name: /리터치 일정 지남/ }).click();
  ok("일정 지남 점검으로 교체: 지난일정고객", (await names()).join() === "지난일정고객", (await names()).join());

  await grp().getByRole("button", { name: /계약 금액 미기재/ }).click();
  ok("계약 금액 미기재: 가짜계약고객(계약됨 배지)", (await names()).join() === "가짜계약고객" && (await p.getByText("계약됨").count()) >= 1);

  await grp().getByRole("button", { name: /24시간 넘게 미배정/ }).click();
  ok("미배정 점검 표 건수 = 점검 건수", (await total()) === un, `${await total()} vs ${un}`);
  ok("방금들어온고객은 미배정 점검에서 제외(24시간 전)", !(await names()).includes("방금들어온고객"));

  // 같은 항목을 다시 누르면 해제 → 신규 리드 목록
  await grp().getByRole("button", { name: /24시간 넘게 미배정/ }).click();
  ok("다시 누르면 해제되고 신규 리드 목록으로 복귀", /신규 리드 · 총/.test((await p.locator("body").innerText()).replace(/\s+/g, " ")));

  // 일정관리와 점검은 동시에 켜지지 않음
  await grp().getByRole("button", { name: /14일 넘게 활동 없음/ }).click();
  await p.getByRole("button", { name: "일정관리" }).click();
  ok("일정관리를 켜면 점검이 풀림", (await grp().getByRole("button", { name: /14일 넘게 활동 없음/ }).getAttribute("aria-pressed")) === "false");

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: out("checks.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
