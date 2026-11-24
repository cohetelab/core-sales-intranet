// 월별 계약 금액 · 월 목표 · 달성률: 홈 카드(영업별 금액·목표 입력·달성률·지난달) + 리포트 표. 목표는 팀 공용 설정에 저장된다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const D = 86400000;
const kst = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const stamp = (ms) => kst(ms).slice(0, 16).replace("T", " ");
const noteStamp = (ms) => { const s = kst(ms); return `[${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)} Ian]`; };
const C = { stage: 4, owner: 10, consult: 14, contract: 16 };

(async () => {
  const now = Date.now();
  const d = new Date(now + 9 * 3600 * 1000);
  const lastMonth15 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15, 3, 0); // 지난달 15일 12:00 KST
  const monthLabel = (ms) => kst(ms).slice(0, 7);
  const toWon = (ms) => `${noteStamp(ms)} (단계) 연락됨 → 성사`;
  const S = (name, ph, cells) => admin("append", { cells: { 1: name, 2: ph, 5: "영상 제작", 6: "홈페이지", [C.stage]: "성사", ...cells } });
  await S("계약A", "010-7900-0001", { 0: stamp(now - 2 * D), [C.owner]: "이익재(Ian)", [C.contract]: "₩3,000,000", [C.consult]: toWon(now) });
  await S("계약B", "010-7900-0002", { 0: stamp(now), [C.owner]: "이익재(Ian)", [C.contract]: "₩2,000,000" }); // 성사 줄 없음 → 추정
  await S("계약C", "010-7900-0003", { 0: stamp(now - 2 * D), [C.owner]: "김세현(Connor)", [C.consult]: toWon(now) }); // 금액 없음
  await S("계약D", "010-7900-0004", { 0: stamp(lastMonth15 - 5 * D), [C.owner]: "이익재(Ian)", [C.contract]: "₩8,000,000", [C.consult]: toWon(lastMonth15) }); // 지난달
  await S("계약E", "010-7900-0005", { 0: stamp(now - 2 * D), [C.contract]: "₩1,000,000", [C.consult]: toWon(now) }); // 담당 없음 → 기타

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const card = () => p.getByRole("region", { name: "월 목표 달성률" });
  const rowOf = (rep) => card().getByRole("listitem", { name: `${rep} 달성률` });
  const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
  const doc = async () => (await (await ctx.request.get(`${BASE}/api/leads/workspace-config`)).json()).doc;

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector('[data-widget="target"]');

  // 1) 홈 카드: 이번 달 영업별 계약 금액
  await card().waitFor();
  ok("카드 제목에 이번 달 표시", (await txt(card())).includes(`${Number(monthLabel(now).slice(5))}월 계약 금액`));
  ok("Ian: 500만원 · 계약 2건(3,000,000 + 2,000,000)", await until(async () => (await txt(rowOf("이익재(Ian)"))).includes("500만원 · 계약 2건")), await txt(rowOf("이익재(Ian)")));
  ok("Connor: 금액이 비어 있는 계약 1건 → 0원 · 계약 1건", (await txt(rowOf("김세현(Connor)"))).includes("0원 · 계약 1건"));
  ok("목표가 없으면 안내", (await txt(rowOf("이익재(Ian)"))).includes("목표를 입력하면 달성률이 보입니다"));
  const sum = await txt(card().getByLabel("팀 합계"));
  ok("팀 합계 6,000,000원(Ian 5,000,000 + 미배정 1,000,000)과 기타 안내", sum.includes("6,000,000원") && sum.includes("담당 영업이 아닌 계약 1건"), sum);
  ok("주의: 금액 미기재 1건 · 날짜 추정 1건", sum.includes("계약 금액이 비어 있는 계약 1건") && sum.includes("추정했습니다") && sum.includes("모르는 1건"), sum);

  // 2) 목표 입력 → 달성률
  const ianInput = card().getByLabel("이익재 월 목표(만원)");
  await ianInput.fill("1000"); await ianInput.press("Enter");
  ok("목표 1000만원 입력 → 달성률 50% · 500만원 남음", await until(async () => (await txt(rowOf("이익재(Ian)"))).includes("달성률 50% · 500만원 남음")), await txt(rowOf("이익재(Ian)")));
  ok("진행 막대 50", (await rowOf("이익재(Ian)").getByRole("progressbar").getAttribute("aria-valuenow")) === "50");
  ok("팀 합계에 목표 대비 표시(영업 합계 500만 / 목표 1,000만원 · 50%)", (await txt(card().getByLabel("팀 합계"))).includes("목표 1,000만원 · 50%"));
  ok("서버(팀 공용 설정)에 저장: Ian 목표 10,000,000", await until(async () => (await doc())?.config?.targets?.["이익재(Ian)"] === 10_000_000), JSON.stringify((await doc())?.config?.targets));
  await card().getByLabel("김세현 월 목표(만원)").fill("200"); await card().getByLabel("김세현 월 목표(만원)").press("Enter");
  ok("Connor 목표 200만원, 금액 0 → 달성률 0% · 200만원 남음", await until(async () => (await txt(rowOf("김세현(Connor)"))).includes("달성률 0% · 200만원 남음")), await txt(rowOf("김세현(Connor)")));

  // 3) 새로고침해도 유지(팀 공용 저장) · 목표 초과 시 '달성'
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-widget="target"]');
  ok("새로고침 후에도 목표가 남아 있음", await until(async () => (await card().getByLabel("이익재 월 목표(만원)").inputValue()) === "1000"));
  await card().getByLabel("이익재 월 목표(만원)").fill("400"); await card().getByLabel("이익재 월 목표(만원)").press("Enter");
  ok("목표(400만) 이상이면 '달성' 표시(125%)", await until(async () => (await txt(rowOf("이익재(Ian)"))).includes("달성률 125% · 달성")), await txt(rowOf("이익재(Ian)")));
  await card().getByLabel("이익재 월 목표(만원)").fill(""); await card().getByLabel("이익재 월 목표(만원)").press("Enter");
  ok("목표를 비우면 달성률 안내로 돌아감 · 서버에서도 삭제", await until(async () => (await txt(rowOf("이익재(Ian)"))).includes("목표를 입력하면") && !("이익재(Ian)" in ((await doc())?.config?.targets ?? {}))));
  await card().getByLabel("이익재 월 목표(만원)").fill("1000"); await card().getByLabel("이익재 월 목표(만원)").press("Enter");
  await until(async () => (await doc())?.config?.targets?.["이익재(Ian)"] === 10_000_000);

  // 4) 지난달
  await card().getByRole("button", { name: "지난달" }).click();
  ok("지난달: Ian 800만원 · 계약 1건 · 달성률 80%", await until(async () => { const t = await txt(rowOf("이익재(Ian)")); return t.includes("800만원 · 계약 1건") && t.includes("달성률 80%"); }), await txt(rowOf("이익재(Ian)")));
  ok("지난달 합계에는 이번 달 계약이 섞이지 않음(8,000,000원)", (await txt(card().getByLabel("팀 합계"))).includes("8,000,000원") && !(await txt(card().getByLabel("팀 합계"))).includes("담당 영업이 아닌"));

  // 5) 리포트: 월별 영업 계약 금액
  await p.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  const table = p.getByRole("table", { name: "월별 영업 계약 금액" });
  await table.waitFor();
  ok("리포트 표: 최근 6개월 행", (await table.locator("tbody tr").count()) === 6);
  const thisRow = await txt(table.locator(`tr[data-month="${monthLabel(now)}"]`));
  ok("이번 달 행: Ian 5,000,000원 · 2건 · 달성률 50% / 합계 6,000,000원 · 3건 중 기타 1건 포함", thisRow.includes("5,000,000원") && thisRow.includes("2건 · 달성률 50%") && thisRow.includes("6,000,000원") , thisRow);
  const lastRow = await txt(table.locator(`tr[data-month="${monthLabel(lastMonth15)}"]`));
  ok("지난달 행: Ian 8,000,000원 · 달성률 80%", lastRow.includes("8,000,000원") && lastRow.includes("달성률 80%"), lastRow);
  const head = await txt(table.locator("thead"));
  ok("머리글에 영업별 목표(Ian 1,000만원 · Connor 200만원)와 기타 열", head.includes("목표 1,000만원") && head.includes("목표 200만원") && head.includes("기타(미배정·퇴사)"), head);
  ok("주의 문구(추정·금액 미기재)", (await txt(p.locator("#monthly-sales"))).includes("추정한 달"));

  // 6) 다른 사람(Ian) 화면에도 같은 목표가 보임(팀 공용)
  const ctx2 = await b.newContext({ viewport: { width: 1600, height: 1500 } });
  const q = await ctx2.newPage();
  await q.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await q.getByRole("combobox", { name: "내 이름" }).click(); await q.getByRole("option", { name: "이익재(Ian)" }).click();
  await q.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await q.getByRole("button", { name: "들어가기" }).click();
  await q.waitForSelector('[data-widget="target"]');
  ok("Ian 화면에도 목표 1000만원이 보임(팀 공용)", await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { if ((await q.getByRole("region", { name: "월 목표 달성률" }).getByLabel("이익재 월 목표(만원)").inputValue()) === "1000") return true; await q.waitForTimeout(250); } return false; })());

  ok("화면 오류 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
