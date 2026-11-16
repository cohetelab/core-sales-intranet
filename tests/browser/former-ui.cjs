const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const OWNER = 10; // 담당자 열(0부터)

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const chipN = async (label) => { const c = p.getByRole("group", { name: "담당 필터" }).getByRole("button", { name: new RegExp(label) }); if ((await c.count()) === 0) return null; return Number((await c.innerText()).trim().split(/\s+/).pop().replace(/\D/g, "")); };

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  const former = await chipN("이전 담당\\(퇴사자\\)");
  const unassigned = await chipN("^미배정");
  ok("'이전 담당(퇴사자)' 칩이 보임(건수 > 0)", former !== null && former > 0, String(former));
  ok("이전 담당은 미배정의 일부", former <= unassigned, `${former} <= ${unassigned}`);

  await p.getByRole("group", { name: "담당 필터" }).getByRole("button", { name: /이전 담당\(퇴사자\)/ }).click();
  await p.waitForTimeout(400);
  const rows = await p.locator("tbody tr").allInnerTexts();
  ok(`표에 ${former}건만, 모두 '이전 담당' 표시`, rows.length === Math.min(former, 50) && rows.every((t) => t.includes("이전 담당:")), String(rows.length));
  ok("자동 배분 버튼이 같은 건수를 보여 줌", (await p.getByRole("button", { name: new RegExp(`미배정 ${former}건 자동 배분`) }).count()) === 1);

  // 이 칩에서 자동 배분하면 퇴사자 리드만 Ian/Connor에게 나뉜다
  const before = (await admin("dump")).rows.filter((r) => /Luna|Leo|Kevin/.test(r[OWNER])).length;
  await p.getByRole("button", { name: new RegExp(`미배정 ${former}건 자동 배분`) }).click();
  await p.getByRole("button", { name: "배분하기" }).click();
  ok("배분 후 이전 담당 칩이 사라짐", await until(async () => (await chipN("이전 담당\\(퇴사자\\)")) === null || (await chipN("이전 담당\\(퇴사자\\)")) === 0));
  let d = await admin("dump");
  await until(async () => { d = await admin("dump"); return d.rows.filter((r) => /Luna|Leo|Kevin/.test(r[OWNER])).length === 0; }, 30000);
  const after = d.rows.filter((r) => /Luna|Leo|Kevin/.test(r[OWNER])).length;
  ok("시트: 퇴사자 이름이 담당자 칸에서 Ian/Connor로 바뀜", after < before && after === 0, `${before} → ${after}`);
  const logs = d.log.filter((l) => /Luna|Leo|Kevin/.test(l[5]) && /Ian|Connor/.test(l[6]));
  ok("기록 탭에 '이전 값: 퇴사자 → 새 값: Ian/Connor'가 남음(되돌릴 근거)", logs.length > 0, String(logs.length));
  ok("미배정 건수가 이전 담당만큼 줄어듦", await until(async () => (await chipN("^미배정")) === unassigned - former), `${await chipN("^미배정")} vs ${unassigned - former}`);

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
