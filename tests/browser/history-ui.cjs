const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const C = { consult: 14 };
const dump = () => admin("dump");

(async () => {
  const consult = [
    "3/20 전화했으나 부재중",
    "[11.06 14:30 Ian] (전화) 단가 문의",
    "[11.07 10:05 Connor] (미팅) 안건",
    "1. 예산 확인",
    "2. 일정 조율",
  ].join("\n");
  await admin("append", { cells: { 0: "2026-11-01 09:00", 1: "히스토리고객", 2: "010-7200-0001", 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)", 14: consult } });
  // 칸이 거의 가득 찬 고객(4900자: 짧은 기록은 들어가고 긴 기록은 넘침)
  const head = "[11.06 14:30 Ian] (전화) ";
  await admin("append", { cells: { 0: "2026-11-01 09:00", 1: "가득찬고객", 2: "010-7200-0002", 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)", 14: head + "가".repeat(4900 - head.length) } });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const search = async (q) => { await p.getByLabel("리드 검색").fill(q); await p.waitForTimeout(250); };
  const tl = () => p.getByRole("list", { name: "상담 히스토리" });
  const rowOf = async (name) => (await dump()).rows.find((r) => r[1] === name);

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  await search("7200-0001");
  await p.getByRole("button", { name: "히스토리고객", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');

  ok("타임라인: 직접 적은 내용 1 + 기록 2 = 3칸", (await tl().getByRole("listitem").count()) === 3, String(await tl().getByRole("listitem").count()));
  const tt = (await tl().innerText()).replace(/\s+/g, " ");
  ok("'시트에 직접 적은 내용' 카드에 옛 메모", tt.includes("시트에 직접 적은 내용") && tt.includes("3/20 전화했으나 부재중"));
  ok("1차 컨택 · Ian · 11.06 14:30 · 전화", /Ian 11\.06 14:30 1차 컨택 전화 단가 문의/.test(tt), tt);
  ok("2차 컨택 · Connor · 미팅 · 여러 줄 내용", /Connor 11\.07 10:05 2차 컨택 미팅 안건 1\. 예산 확인 2\. 일정 조율/.test(tt), tt);
  ok("상담 히스토리 · 2건 표시", (await p.getByText("상담 히스토리", { exact: false }).first().innerText()).includes("2건") || (await p.locator('[aria-label="상담 기록"]').innerText()).includes("· 2건"));
  ok("활동 이력 목록에는 '1차 상담 내용'이 중복으로 나오지 않음", (await p.getByText("1차 상담 내용", { exact: true }).count()) === 0);
  ok("글자 수 표시 '상담 기록 칸 N/5,000자'", (await p.getByText(/상담 기록 칸 [\d,]+\/5,000자/).count()) === 1);
  ok("기록 유형 선택 4개(기본: 전화)", (await p.getByRole("group", { name: "기록 유형" }).getByRole("button").count()) === 4 && (await p.getByRole("group", { name: "기록 유형" }).getByRole("button", { name: "전화" }).getAttribute("aria-pressed")) === "true");
  ok("이미 시각이 남은 기록이 있어 '첫 컨택 완료' 버튼은 없음", (await p.getByRole("button", { name: "첫 컨택 완료" }).count()) === 0);

  // 새 기록: 이메일 유형
  await p.getByRole("group", { name: "기록 유형" }).getByRole("button", { name: "이메일" }).click();
  await p.getByLabel("상담 내용 추가").fill("견적서 메일 발송\n회신 대기");
  await p.getByRole("button", { name: "시트에 저장" }).click();
  ok("시트에 '(이메일)' 유형이 붙은 줄이 이어서 기록됨(기존 내용 유지)", await until(async () => {
    const r = await rowOf("히스토리고객");
    return r && r[C.consult].startsWith(consult) && /\n\[\d\d\.\d\d \d\d:\d\d Connor\] \(이메일\) 견적서 메일 발송\n회신 대기$/.test(r[C.consult]);
  }));
  ok("타임라인에 3차 컨택(이메일)이 추가되고 여러 줄이 한 카드", await until(async () => /3차 컨택 이메일 견적서 메일 발송 회신 대기/.test((await tl().innerText()).replace(/\s+/g, " "))) && (await tl().getByRole("listitem").count()) === 4);
  ok("저장 후 입력칸이 비워지고 '시트에 저장했습니다'", (await p.getByLabel("상담 내용 추가").inputValue()) === "" && (await p.getByText("시트에 저장했습니다").count()) >= 1);
  await p.keyboard.press("Escape");

  // 가득 찬 칸
  await search("7200-0002");
  await p.getByRole("button", { name: "가득찬고객", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  ok("85% 넘으면 글자 수 안내가 노란 경고 색", await p.getByText(/상담 기록 칸 4,900\/5,000자/).evaluate((el) => /amber/.test(el.className)));
  await p.getByLabel("상담 내용 추가").fill("가".repeat(120));
  ok("한도를 넘으면 '가득 찼습니다' 경고 + 저장 비활성", (await p.getByText(/상담 기록 칸이 가득 찼습니다/).count()) === 1 && (await p.getByRole("button", { name: "시트에 저장" }).isDisabled()));
  await p.getByLabel("상담 내용 추가").fill("짧게");
  ok("충분히 짧으면 다시 저장 가능", await until(async () => (await p.getByRole("button", { name: "시트에 저장" }).isEnabled()) && (await p.getByText(/상담 기록 칸이 가득 찼습니다/).count()) === 0));
  await p.getByLabel("상담 내용 추가").fill("");
  const before = (await rowOf("가득찬고객"))[C.consult].length;
  ok("시트의 가득 찬 칸은 건드리지 않음", before === 4900, String(before));

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await p.keyboard.press("Escape");
  await search("7200-0001");
  await p.getByRole("button", { name: "히스토리고객", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  await p.screenshot({ path: out("history.png") });
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
