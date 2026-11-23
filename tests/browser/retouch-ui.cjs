// 리터치 풀: 쌓인 옛 DB를 조건으로 걸러 영업에게 일괄 배정한다. 필터 · 배정(시트 담당자·히스토리 줄·종료 해제·다음 액션) · 균등 배분 · 문구 복사.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const D = 86400000;
const kst = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const stamp = (ms) => kst(ms).slice(0, 16).replace("T", " ");
const noteStamp = (ms) => { const s = kst(ms); return `[${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)} Ian]`; };
const sd = (ms) => { const [y, m, d] = kst(ms).slice(0, 10).split("-"); return `${y}. ${+m}. ${+d}.`; };
const C = { stage: 4, owner: 10, prob: 11, retouch: 13, consult: 14, next: 15 };

(async () => {
  const now = Date.now();
  let ph = 0;
  const S = (name, ageDays, cells = {}) => admin("append", { cells: { 0: stamp(now - ageDays * D), 1: name, 2: `010-7800-${String(++ph).padStart(4, "0")}`, 5: "퍼포먼스 마케팅", 6: "홈페이지", ...cells } });
  await S("풀A진행", 70);
  await S("풀B연락됨", 80, { [C.stage]: "연락됨", [C.owner]: "이익재(Ian)", [C.next]: "견적 재발송", [C.consult]: `${noteStamp(now - 70 * D)} (전화) 통화` });
  await S("풀C성사", 75, { [C.stage]: "성사" });
  await S("풀D가격종료", 72, { [C.stage]: "실패/종료", [C.consult]: `${noteStamp(now - 60 * D)} (메모) 종료 사유: 가격` });
  await S("풀E시기종료", 74, { [C.stage]: "실패/종료", [C.consult]: `${noteStamp(now - 60 * D)} (메모) 종료 사유: 시기` });
  await S("풀F최근움직임", 78, { [C.consult]: `${noteStamp(now - 5 * D)} (전화) 통화` });
  await S("풀G미래일정", 76, { [C.retouch]: sd(now + 5 * D) });
  await S("풀H가능성낮음", 71, { [C.prob]: "5%" });
  await S("풀I사십일", 40);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => {});
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const dump = () => admin("dump");
  const rowOf = (d, name) => d.rows.filter((r) => r[1] === name).slice(-1)[0];
  const names = async () => (await p.locator("tbody tr td:nth-child(3)").allInnerTexts()).map((t) => t.trim()).filter((t) => t.startsWith("풀") || t.startsWith("균등") || t.startsWith("보존")).sort();
  const poolCount = async () => Number((await p.getByRole("status", { name: "풀 건수" }).innerText()).match(/고객\s*([\d,]+)\s*명/)[1].replace(/,/g, ""));
  const chip = (label) => p.getByRole("button", { name: label, exact: true });
  const openPool = async () => { await p.getByRole("button", { name: /리터치 풀/ }).click(); await p.getByText("리터치 풀 · 쌓여 있는 옛 DB").waitFor(); };

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  // 1) 진입: 리드 화면 헤더에 건수와 함께 버튼이 있다
  const entry = await p.getByRole("button", { name: /리터치 풀/ }).innerText();
  ok("헤더에 '리터치 풀' 버튼(건수 표시)", /리터치 풀\s*\d+/.test(entry), entry.replace(/\s+/g, " "));
  await openPool();
  ok("리터치 풀 화면 + 안내(온도 칸이 없어 사유·가능성·움직임으로 거름)", (await p.getByText("리드 온도").count()) >= 1);
  ok("기본 조건: 60일 이상 · 30일 이상 움직임 없음 · 종료 포함 · 가격/경쟁사 제외", (await chip("문의 60일 이상").getAttribute("aria-pressed")) === "true" && (await chip("움직임 30일 이상 없음").getAttribute("aria-pressed")) === "true" && (await chip("종료된 건 포함").getAttribute("aria-pressed")) === "true" && (await chip("가격 사유 제외").getAttribute("aria-pressed")) === "true" && (await chip("경쟁사 사유 제외").getAttribute("aria-pressed")) === "true");

  // 2) 필터: 시험용 고객만 보이게 상한 90일
  await chip("문의 90일 이하").click();
  ok("60~90일 · 기본 필터: 진행A·연락됨B·시기종료E·가능성낮음H (성사C·가격종료D·최근움직임F·미래일정G·40일I 제외)", (await names()).join() === "풀A진행,풀B연락됨,풀E시기종료,풀H가능성낮음", (await names()).join());
  ok("건수 표시와 일치(4명)", (await poolCount()) === 4);
  await chip("문의 30일 이상").click();
  ok("30일 이상으로 넓히면 40일 전 고객도", (await names()).join() === "풀A진행,풀B연락됨,풀E시기종료,풀H가능성낮음,풀I사십일", (await names()).join());
  await chip("문의 60일 이상").click();
  await chip("가능성 10% 미만 제외").click();
  ok("가능성 10% 미만 제외: 5%로 적힌 H가 빠짐(미기재는 유지)", (await names()).join() === "풀A진행,풀B연락됨,풀E시기종료", (await names()).join());
  await chip("가능성 제한 없음").click();
  await chip("가격 사유 제외").click(); // 제외 해제 → 가격으로 종료한 건도 포함
  ok("가격 사유 제외를 끄면 가격 종료 D도 포함", (await names()).includes("풀D가격종료") && (await names()).length === 5, (await names()).join());
  await chip("가격 사유 제외").click();
  await chip("종료된 건 포함").click();
  ok("종료된 건 포함을 끄면 종료 건(E)이 빠짐", (await names()).join() === "풀A진행,풀B연락됨,풀H가능성낮음", (await names()).join());
  await chip("종료된 건 포함").click();
  await chip("시기 사유 제외").click();
  ok("시기 사유를 제외하면 E가 빠짐", !(await names()).includes("풀E시기종료"));
  await chip("시기 사유 제외").click();
  ok("서비스 필터: 숏폼에는 시험용 고객 없음", (await (async () => { await chip("숏폼 서비스").click(); const r = (await names()).length === 0; await chip("전체 서비스").click(); return r; })()));
  await chip("미배정만").click();
  ok("미배정만: B(Ian 담당) 제외", (await names()).join() === "풀A진행,풀E시기종료,풀H가능성낮음", (await names()).join());
  await chip("담당 전체").click();

  // 3) 문구 복사
  await p.getByRole("button", { name: "풀A진행 리터치 문구 복사" }).click();
  ok("문구 복사: 버튼이 '복사됨'으로 바뀜", await until(async () => (await p.getByRole("button", { name: "풀A진행 리터치 문구 복사" }).innerText()).includes("복사됨"), 5000));
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  ok("복사된 문구: 상호·서비스를 넣은 재접촉 문구", clip.includes("풀A진행 담당자님") && clip.includes("퍼포먼스") && clip.includes("현재 필요하신 서비스는 없으실까요?"), clip);

  // 4) 일괄 배정: 전체 선택 → Ian에게 (종료 건은 종료 해제)
  await p.getByRole("checkbox", { name: /명 전체 선택/ }).click();
  ok("선택 표시: 4명 선택됨 + 종료 해제 옵션(종료 1명)", (await p.getByText("4명 선택됨").count()) === 1 && (await p.getByRole("checkbox", { name: "종료 해제하고 배정" }).isChecked()));
  await p.getByRole("button", { name: "이익재에게 배정" }).click();
  const dlg = p.getByRole("alertdialog");
  ok("확인 창: 4명 · 이익재(Ian) · 종료 해제 안내", (await dlg.innerText()).includes("4명을 이익재(Ian)에게 배정") && (await dlg.innerText()).includes("종료가 해제"));
  await dlg.getByRole("button", { name: "배정" }).click();
  ok("배정 뒤 이 4명은 풀에서 빠짐(방금 움직였으니 30일 조건 밖)", await until(async () => (await names()).length === 0 && (await poolCount()) === 0), String(await names()));

  const d1 = await dump();
  const A = rowOf(d1, "풀A진행"), B = rowOf(d1, "풀B연락됨"), E = rowOf(d1, "풀E시기종료"), H = rowOf(d1, "풀H가능성낮음");
  const last = (r) => (r[C.consult] || "").split("\n").pop();
  ok("시트: 4명 모두 담당자 = 이익재(Ian)", [A, B, E, H].every((r) => r[C.owner] === "이익재(Ian)"), [A, B, E, H].map((r) => r[C.owner]).join());
  ok("시트: 상담 내용 끝에 '(메모) 리터치 풀 배정 → Ian' 줄", [A, B, E, H].every((r) => /\[\d\d\.\d\d \d\d:\d\d Connor\] \(메모\) 리터치 풀 배정 → Ian$/.test(last(r))), last(A));
  ok("시트: 다음 액션이 비어 있던 A·E·H는 '리터치: 이전 문의 재접촉'", [A, E, H].every((r) => r[C.next] === "리터치: 이전 문의 재접촉"), [A, E, H].map((r) => r[C.next]).join(" | "));
  ok("시트: 이미 적힌 다음 액션(B)은 덮어쓰지 않음", B[C.next] === "견적 재발송");
  ok("시트: 종료 건 E는 종료 해제(단계 비움) + '(단계) 실패/종료 → 리드' 줄이 배정 줄 앞에 남음", E[C.stage] === "" && /\(단계\) 실패\/종료 → 리드\n.*리터치 풀 배정 → Ian$/.test(E[C.consult]), E[C.stage] + " | " + E[C.consult].replace(/\n/g, " / "));
  ok("시트: B의 기존 상담 내용은 그대로 앞에 남음", (B[C.consult] || "").startsWith(noteStamp(now - 70 * D) + " (전화) 통화"));
  const untouched = ["풀C성사", "풀D가격종료", "풀F최근움직임", "풀G미래일정", "풀I사십일"].map((nm) => rowOf(d1, nm));
  ok("시트: 풀에 없던 고객(성사·가격종료·최근움직임·미래일정·40일)은 담당자가 그대로", untouched.every((r) => r[C.owner] === ""), untouched.map((r) => r[1] + ":" + r[C.owner]).join());
  ok("시트: 가격 종료 D는 종료 상태 그대로", rowOf(d1, "풀D가격종료")[C.stage] === "실패/종료");
  ok("기록 탭에 담당자 변경 3건(이미 Ian인 B는 다시 쓰지 않음)과 종료 해제(단계 비움)가 남음", d1.log.filter((l) => l[4] === "담당자" && l[7] === "ok").length === 3 && d1.log.some((l) => l[4] === "단계" && l[6] === "" && l[7] === "ok"), JSON.stringify(d1.log.filter((l) => l[4] === "담당자" || l[4] === "단계").map((l) => [l[4], l[6], l[7]])));

  // 5) 종료 해제를 끄고 균등 배분
  await S("균등1", 85); await S("균등2", 86);
  await S("보존종료", 84, { [C.stage]: "실패/종료", [C.consult]: `${noteStamp(now - 60 * D)} (메모) 종료 사유: 무응답` });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("text=시트가 원본입니다");
  await openPool();
  await chip("문의 90일 이하").click();
  ok("새로 넣은 3명이 풀에 보임", (await names()).join() === "균등1,균등2,보존종료", (await names()).join());
  await p.getByRole("checkbox", { name: /명 전체 선택/ }).click();
  await p.getByRole("checkbox", { name: "종료 해제하고 배정" }).click(); // 해제 끄기
  await p.getByRole("button", { name: "균등 배분" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "균등 배분" }).click();
  ok("균등 배분 후 풀에서 빠짐", await until(async () => (await names()).length === 0));
  const d2 = await dump();
  const owners = ["균등1", "균등2", "보존종료"].map((nm) => rowOf(d2, nm)[C.owner]);
  ok("시트: 3명 모두 등록된 영업에게 배정", owners.every((o) => o === "이익재(Ian)" || o === "김세현(Connor)"), owners.join());
  ok("시트: 영업 부하가 적은 쪽(Connor)부터 채움 — 균등1은 Connor", rowOf(d2, "균등1")[C.owner] === "김세현(Connor)", owners.join());
  ok("시트: 종료 해제를 끄면 종료 상태 그대로(단계 유지 · 단계 줄 없음) + 리터치 줄은 남음", rowOf(d2, "보존종료")[C.stage] === "실패/종료" && !/\(단계\)/.test(rowOf(d2, "보존종료")[C.consult]) && /리터치 풀 배정 → (Ian|Connor)$/.test(last(rowOf(d2, "보존종료"))), rowOf(d2, "보존종료")[C.consult]);

  // 6) 돌아가기
  await p.getByRole("button", { name: "리드로 돌아가기" }).click();
  ok("리드로 돌아가기: 리드 목록 화면", (await p.getByText("시트가 원본입니다").count()) >= 1 && (await p.getByText("리터치 풀 · 쌓여 있는 옛 DB").count()) === 0);
  ok("화면 오류 없음", errs.length === 0, errs.join(" | "));

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
