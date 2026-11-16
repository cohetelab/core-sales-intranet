const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const k = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const stamp = (ms) => k(ms).slice(0, 16).replace("T", " ");
const D = 86400000;
const C = { stage: 4, consult: 14 };

(async () => {
  const now = Date.now();
  const A = (name, ph, channel) => admin("append", { cells: { 0: stamp(now - 20 * D), 1: name, 2: ph, 5: "영상 제작", 6: channel } });
  await A("사유A홈", "010-7600-0001", "홈페이지");
  await A("사유B홈", "010-7600-0002", "홈페이지");
  await A("사유C홈", "010-7600-0003", "홈페이지");
  await A("사유D메타", "010-7600-0004", "META_통합");
  await A("사유E홈", "010-7600-0005", "홈페이지");
  await A("사유F홈진행", "010-7600-0006", "홈페이지"); // 종료하지 않음

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const dump = () => admin("dump");

  await p.goto(`${BASE}/leads#cleanup`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");
  await p.getByRole("group", { name: "정리 기준" }).getByRole("button", { name: /^14일 이상/ }).click();

  // 실제 흐름: 정리 대기함에서 사유를 골라 종료 처리 (무응답 2 · 가격 1 · 경쟁사 1 · 사유 없음 1)
  async function closeWith(names, reason) {
    await p.getByLabel("리드 검색").fill("사유");
    await p.waitForTimeout(300);
    await p.getByRole("checkbox", { name: /전체 선택/ }).click(); // 먼저 전체 선택 후
    await p.getByRole("checkbox", { name: /전체 선택/ }).click(); // 해제해서 깨끗한 상태로
    for (const nm of names) await p.getByRole("checkbox", { name: `${nm} 선택` }).click();
    await p.getByRole("button", { name: "종료 처리", exact: true }).first().click();
    await p.waitForSelector('[role="alertdialog"]');
    if (reason) { await p.getByRole("combobox", { name: "종료 사유" }).click(); await p.getByRole("option", { name: reason }).click(); }
    else { await p.getByRole("combobox", { name: "종료 사유" }).click(); await p.getByRole("option", { name: "사유 기록 안 함" }).click(); }
    await p.locator('[role="alertdialog"]').getByRole("button", { name: "종료 처리" }).click();
    await until(async () => { const d = await dump(); return names.every((nm) => d.rows.filter((r) => r[1] === nm).every((r) => r[C.stage] === "실패/종료")); });
  }
  await closeWith(["사유A홈", "사유B홈"], "무응답");
  await closeWith(["사유C홈"], "가격");
  await closeWith(["사유D메타"], "경쟁사");
  await closeWith(["사유E홈"], null);
  const d = await dump();
  const lastLine = (nm) => { const rs = d.rows.filter((r) => r[1] === nm); return rs[rs.length - 1][C.consult].split("\n").pop(); };
  ok("시트: 사유가 상담 기록 줄로 남음(무응답·가격·경쟁사), 사유 없이 종료한 건은 줄 없음",
    /종료 사유: 무응답$/.test(lastLine("사유A홈")) && /종료 사유: 무응답$/.test(lastLine("사유B홈")) && /종료 사유: 가격$/.test(lastLine("사유C홈")) && /종료 사유: 경쟁사$/.test(lastLine("사유D메타")) && lastLine("사유E홈") === "");

  // 리포트에서 집계 확인
  await p.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 90일" }).click();
  await p.waitForTimeout(400);
  const sec = p.getByRole("region", { name: "종료 사유" });
  const secText = (await sec.innerText()).replace(/\s+/g, " ");
  ok("종료 사유 섹션: 종료 5명 / 문의 6명 · 종료율 83.3%", secText.includes("종료 5명 / 문의 6명") && secText.includes("종료율 83.3%"), secText.slice(0, 80));
  const sum = (await sec.getByRole("list", { name: "종료 사유 합계" }).innerText()).replace(/\s+/g, " ");
  ok("합계: 무응답 2(40.0%) · 가격 1(20.0%) · 경쟁사 1(20.0%) · 사유 없음 1(20.0%)", /무응답 2 \(40%\)/.test(sum) && /가격 1 \(20%\)/.test(sum) && /경쟁사 1 \(20%\)/.test(sum) && /사유 없음 1 \(20%\)/.test(sum), sum);
  const rowTxt = async (table, key) => (await sec.getByRole("table", { name: table }).locator("tr", { hasText: key }).first().innerText()).replace(/\s+/g, " ").trim();
  const hp = await rowTxt("채널별 종료 사유", "홈페이지"), me = await rowTxt("채널별 종료 사유", "META");
  ok("채널 홈페이지: 문의 5 · 종료 4 · 80% · 무응답 2 · 가격 1 · 사유 없음 1", /^홈페이지 5 4 80% 2 1 0 0 0 1$/.test(hp), hp);
  ok("채널 META: 문의 1 · 종료 1 · 100% · 경쟁사 1", /^META 1 1 100% 0 0 0 1 0 0$/.test(me), me);
  const sv = await rowTxt("서비스별 종료 사유", "숏폼");
  ok("서비스 숏폼: 문의 6 · 종료 5", /^숏폼 6 5 83\.3% 2 1 0 1 0 1$/.test(sv), sv);
  ok("안내: 사유 없음은 사유를 안 골랐거나 시트에서 직접 종료한 건", (await p.locator("body").innerText()).includes("시트에서 직접 종료한 고객은 ‘사유 없음’입니다"));

  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 1일" }).click();
  await p.waitForTimeout(300);
  ok("종료가 없는 기간은 안내 문구", (await sec.innerText()).includes("이 기간에 종료된 고객이 없습니다"));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.getByRole("group", { name: "기간" }).getByRole("button", { name: "최근 90일" }).click();
  await p.waitForTimeout(300);
  await sec.scrollIntoViewIfNeeded();
  await p.screenshot({ path: out("closed.png"), fullPage: true });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
