const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const k = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString(); // KST 시각 문자열
const sheetStamp = (ms) => k(ms).slice(0, 16).replace("T", " "); // YYYY-MM-DD HH:mm
const noteStamp = (ms, who) => `[${k(ms).slice(5, 7)}.${k(ms).slice(8, 10)} ${k(ms).slice(11, 16)} ${who}]`;
const sd = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${y}. ${+m}. ${+d}.`; };
const H = 3600000, MIN = 60000;
const C = { consult: 14, contact: 12 };
const dump = () => admin("dump");

(async () => {
  const now = Date.now();
  const mk = (name, ph, ageMs, consult) => admin("append", { cells: { 0: sheetStamp(now - ageMs), 1: name, 2: ph, 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)", ...(consult ? { 14: consult } : {}) } });
  await mk("응답A", "010-9999-0001", 5 * H, `${noteStamp(now - 5 * H + 20 * MIN, "Ian")} 통화함`);
  await mk("응답B", "010-9999-0002", 4 * H, `${noteStamp(now - 4 * H + 120 * MIN, "Ian")} 통화함`);
  await mk("응답C", "010-9999-0003", 3 * H, "");
  await mk("응답D", "010-9999-0004", 48 * H, "");

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const card = () => p.locator("section, div").filter({ hasText: /^응답 속도/ }).first();
  const dd = async (label) => (await p.locator(`dt:text-is("${label}") + dd`).innerText()).trim();
  const search = async (q) => { await p.getByLabel("리드 검색").fill(q); await p.waitForTimeout(250); };

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  ok("응답 속도 카드가 보임", (await p.getByText("응답 속도", { exact: false }).count()) >= 1 && (await p.getByText("인트라넷에서 남긴 기록만 집계됩니다").count()) === 1);
  ok("중앙값 1시간 10분(20분·2시간의 가운데)", (await dd("중앙값")) === "1시간 10분", await dd("중앙값"));
  ok("1시간 이내 50% · 24시간 이내 100%", (await dd("1시간 이내")) === "50%" && (await dd("24시간 이내")) === "100%");
  ok("측정된 문의 2 / 4건", (await dd("측정된 문의")).replace(/\s/g, "") === "2/4건", await dd("측정된 문의"));
  const body = await p.locator("body").innerText();
  ok("담당별 문구(Ian 1시간 10분 2건)", body.includes("이익재(Ian) 1시간 10분(2건)"));
  ok("24시간 넘게 첫 기록 없음 1건", body.includes("24시간 넘게 첫 기록 없음 1건"));

  // 이미 기록이 있는 고객에는 버튼이 없음
  await search("9999-0001");
  await p.getByRole("button", { name: "응답A", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  ok("기록이 있는 고객 상세에는 '첫 컨택 완료' 버튼 없음", (await p.getByRole("button", { name: "첫 컨택 완료" }).count()) === 0);
  await p.keyboard.press("Escape");

  // 기록이 없는 고객: 버튼 → 시트에 기록 → 카드 숫자 증가
  await search("9999-0003");
  await p.getByRole("button", { name: "응답C", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  const btn = p.getByRole("button", { name: "첫 컨택 완료" });
  ok("기록 없는 고객 상세에는 버튼이 있음", (await btn.count()) === 1 && (await btn.isEnabled()));
  await p.getByLabel("상담 내용 추가").fill("쓰는 중");
  ok("입력 중인 내용이 있으면 버튼 비활성 + 안내", (await btn.isDisabled()) && (await p.getByText("저장하지 않은 내용이 있어요").count()) === 1);
  await p.getByLabel("상담 내용 추가").fill("");
  ok("입력을 지우면 다시 활성", await until(async () => await btn.isEnabled()));
  await btn.click();
  ok("시트에 상담 기록 줄 + 최근 연락일", await until(async () => {
    const r = (await dump()).rows.find((x) => x[1] === "응답C");
    return r && /^\[\d\d\.\d\d \d\d:\d\d Connor\] 첫 컨택 완료$/.test(r[C.consult]) && r[C.contact] === sd(k(Date.now()));
  }));
  ok("저장 후 버튼이 사라짐(이제 시각이 남은 기록이 있음)", await until(async () => (await p.getByRole("button", { name: "첫 컨택 완료" }).count()) === 0));
  await p.keyboard.press("Escape");
  await search("");
  ok("카드: 측정된 문의 3 / 4건", await until(async () => (await dd("측정된 문의")).replace(/\s/g, "") === "3/4건"));
  ok("중앙값이 바뀜(20분·2시간·약3시간 → 2시간)", await until(async () => (await dd("중앙값")) === "2시간", 8000), await dd("중앙값"));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: out("response.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
