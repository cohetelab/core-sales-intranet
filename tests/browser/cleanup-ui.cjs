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
const C = { stage: 4, consult: 14 };
const dump = () => admin("dump");

(async () => {
  const now = Date.now();
  await admin("append", { cells: { 0: stamp(now - 2 * D), 1: "정리신선고객", 2: "010-7400-0001", 5: "영상 제작", 6: "홈페이지" } });
  await admin("append", { cells: { 0: "2026-03-05 10:00", 1: "정리일정고객", 2: "010-7400-0002", 5: "영상 제작", 6: "홈페이지", 13: sd(now + 10 * D) } });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const body = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const daysGroup = () => p.getByRole("group", { name: "정리 기준" });
  const dayN = async (d) => Number((await daysGroup().getByRole("button", { name: new RegExp(`^${d}일 이상`) }).innerText()).trim().split(/\s+/).pop().replace(/\D/g, ""));
  const names = async () => (await p.locator("tbody tr td:nth-child(3)").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
  const toggle = () => p.getByRole("button", { name: /정리 대기함/ });

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  // 1) 홈 알람 → 정리 대기함으로 이동
  const note = p.getByRole("note", { name: "정리 대기" });
  ok("홈에 '정리 대기 N건' 알람", (await note.count()) === 1 && /정리 대기 \d+건/.test(await note.innerText()), (await note.innerText()).slice(0, 40));
  const homeN = Number((await note.innerText()).match(/정리 대기 (\d+)건/)[1]);
  await note.getByRole("link", { name: /정리 대기함 열기/ }).click();
  await p.waitForSelector("text=시트가 원본입니다");
  ok("링크로 열면 정리 대기함이 바로 켜짐(#cleanup)", await until(async () => (await toggle().getAttribute("aria-pressed")) === "true") && /#cleanup/.test(p.url()));
  ok("정리 기준 칩 5개(14·30·60·90·180일 이상)", (await daysGroup().getByRole("button").count()) === 5);
  const n14 = await dayN(14), n30 = await dayN(30), n60 = await dayN(60), n90 = await dayN(90), n180 = await dayN(180);
  ok("기준이 길수록 건수가 같거나 줄어듦", n14 >= n30 && n30 >= n60 && n60 >= n90 && n90 >= n180, [n14, n30, n60, n90, n180].join(","));
  ok("홈 알람 건수 = 30일 기준 건수", homeN === n30, `${homeN} vs ${n30}`);
  ok("헤더 버튼 건수도 30일 기준", Number((await toggle().innerText()).trim().split(/\s+/).pop()) === n30);

  // 2) 후보 선별
  let rows = await names();
  ok("최근 문의·예정 일정이 있는 고객은 후보가 아님", !rows.includes("정리신선고객") && !rows.includes("정리일정고객"));
  ok("계약 고객은 후보가 아님", !rows.includes("가짜계약고객"));
  const idle = (await p.locator("tbody tr td:nth-last-child(2)").allInnerTexts()).map((t) => Number(t.replace(/\D/g, "")));
  ok("'마지막 움직임 N일 전' 열이 보이고 가장 오래된 순", idle.length > 0 && idle.every((v, i) => i === 0 || idle[i - 1] >= v), idle.slice(0, 4).join(","));

  // 3) 3건 선택 → 사유 '무응답'으로 종료 처리
  const picked = rows.slice(0, 3);
  for (const nm of picked) await p.getByRole("checkbox", { name: `${nm} 선택` }).click();
  ok("3건 선택됨 표시", /3건 선택됨/.test(await body()));
  await p.getByRole("button", { name: "종료 처리", exact: true }).first().click();
  await p.waitForSelector('[role="alertdialog"]');
  ok("확인 창: 3건 · 되돌릴 수 있음 · 다시 문의하면 되살아남 안내", (await p.locator('[role="alertdialog"]').innerText()).includes("3건을 종료 처리할까요?") && (await p.locator('[role="alertdialog"]').innerText()).includes("종료 해제") && (await p.locator('[role="alertdialog"]').innerText()).includes("되살아납니다"));
  await p.getByRole("combobox", { name: "종료 사유" }).click();
  await p.getByRole("option", { name: "무응답" }).click();
  await p.locator('[role="alertdialog"]').getByRole("button", { name: "종료 처리" }).click();
  ok("종료한 3건이 목록에서 사라짐", await until(async () => { const r = await names(); return picked.every((x) => !r.includes(x)); }));
  ok("정리 대기 건수가 3 줄어듦", await until(async () => (await dayN(30)) === n30 - 3), `${await dayN(30)} vs ${n30 - 3}`);
  let d = await dump();
  const rowsOf = (nm) => d.rows.filter((r) => r[1] === nm);
  // 화면은 먼저 바뀌고 시트 쓰기는 조금 뒤에 끝난다. 시트가 바뀔 때까지 기다린다.
  await until(async () => { d = await dump(); return picked.every((nm) => rowsOf(nm).length > 0 && rowsOf(nm).every((r) => r[C.stage] === "실패/종료")); });
  ok("시트: 3명의 모든 행 '단계' = 실패/종료", picked.every((nm) => rowsOf(nm).length > 0 && rowsOf(nm).every((r) => r[C.stage] === "실패/종료")), picked.join(","));
  ok("시트: 가장 최근 행 상담 내용 끝에 '(메모) 종료 사유: 무응답' 줄", picked.every((nm) => { const rs = rowsOf(nm); return /\[\d\d\.\d\d \d\d:\d\d Connor\] \(메모\) 종료 사유: 무응답$/.test(rs[rs.length - 1][C.consult]); }));
  ok("기록 탭에 단계 변경(→ 실패/종료)이 남음", d.log.filter((l) => l[4] === "단계" && l[6] === "실패/종료").length >= 3);

  // 4) 종료 보기 → 종료 해제
  await p.getByRole("group", { name: "단계 필터" }).getByRole("button", { name: /^실패\/종료/ }).click();
  await p.waitForTimeout(400);
  const closedNames = await names();
  ok("종료 보기에 방금 종료한 3명이 보임", picked.every((x) => closedNames.includes(x)));
  await p.getByRole("checkbox", { name: `${picked[0]} 선택` }).click();
  await p.getByRole("button", { name: "종료 해제" }).click();
  ok("종료 해제: 종료 목록에서 사라짐", await until(async () => !(await names()).includes(picked[0])));
  await until(async () => { d = await dump(); return rowsOf(picked[0]).every((r) => r[C.stage] === ""); });
  ok("시트: 해제한 고객의 '단계'가 비워짐(상담 내용 사유 줄은 그대로 남음)", rowsOf(picked[0]).every((r) => r[C.stage] === "") && /종료 사유: 무응답$/.test(rowsOf(picked[0]).slice(-1)[0][C.consult]));
  ok("해제하지 않은 2명은 계속 종료", picked.slice(1).every((nm) => rowsOf(nm).every((r) => r[C.stage] === "실패/종료")));

  // 5) 종료한 고객이 다시 문의하면 되살아남
  const reopenName = picked[1];
  const phone = rowsOf(reopenName)[0][2];
  await admin("append", { cells: { 0: stamp(Date.now()), 1: reopenName, 2: phone, 5: "영상 제작", 6: "홈페이지" } });
  await p.getByRole("button", { name: "새로고침" }).click();
  ok("재문의가 오면 종료 보기에서 빠짐", await until(async () => !(await names()).includes(reopenName)));
  await p.getByRole("group", { name: "단계 필터" }).getByRole("button", { name: /^전체 단계/ }).click();
  await p.getByLabel("리드 검색").fill(phone.replace(/\D/g, "").slice(-8));
  await p.waitForTimeout(500);
  const rowTxt = (await p.locator("tbody tr").first().innerText()).replace(/\s+/g, " ");
  ok("전체 보기에서 '종료 후 재문의' 표시로 다시 활성", rowTxt.includes(reopenName) && !rowTxt.includes("실패/종료"), rowTxt.slice(0, 90));
  await p.getByLabel("리드 검색").fill("");

  // 6) 많은 건수: 130명을 추가해 전체 선택 → 100건씩 나눠서 종료
  for (let i = 0; i < 130; i++) await admin("append", { cells: { 0: `2025-01-${String((i % 27) + 1).padStart(2, "0")} 10:00`, 1: `대량${String(i).padStart(3, "0")}`, 2: `010-8800-${String(1000 + i)}`, 5: "영상 제작", 6: "홈페이지" } });
  await p.getByRole("button", { name: "새로고침" }).click();
  await p.getByRole("button", { name: /정리 대기함/ }).click(); // 종료 보기로 갔다 와서 꺼져 있으므로 다시 켠다
  await p.waitForSelector('[aria-label="정리 기준"]');
  await until(async () => (await dayN(30)) > 150);
  const before = await dayN(30);
  ok("대량 추가 후 후보가 150건을 넘음", before > 150, String(before));
  await p.getByRole("checkbox", { name: /전체 선택/ }).click();
  ok("전체 선택: 화면에 보이는 50건이 아니라 조건에 맞는 전부 선택", new RegExp(`${before.toLocaleString("ko-KR")}건 선택됨`).test(await body()), (await body()).match(/[\d,]+건 선택됨/)?.[0]);
  await p.getByRole("button", { name: "종료 처리", exact: true }).first().click();
  await p.locator('[role="alertdialog"]').getByRole("button", { name: "종료 처리" }).click();
  ok("100건씩 나눠 처리하고 끝나면 후보가 0건", await until(async () => (await dayN(30)) === 0, 60000), String(await dayN(30)));
  await until(async () => { d = await dump(); return d.rows.filter((r) => /^대량\d{3}$/.test(r[1]) && r[C.stage] === "실패/종료").length === 130; }, 60000);
  const big = d.rows.filter((r) => /^대량\d{3}$/.test(r[1]));
  ok("시트: 대량 130명 모두 '실패/종료'", big.length === 130 && big.every((r) => r[C.stage] === "실패/종료"), `${big.length}행`);
  ok("진행 안내(창을 닫지 마세요)가 끝난 뒤에는 사라짐", (await p.getByRole("status").filter({ hasText: "창을 닫지 마세요" }).count()) === 0);
  ok("후보가 없으면 빈 목록 안내", (await body()).includes("조건에 맞는 리드가 없습니다"));
  ok("최근 문의·예정 일정 고객은 끝까지 종료되지 않음", ["정리신선고객", "정리일정고객"].every((nm) => d.rows.filter((r) => r[1] === nm).every((r) => r[C.stage] === "")));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: out("cleanup.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
