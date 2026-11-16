const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
// 시트 칸(0부터): 단계 4 · 가능성 11 · 최근 연락일 12 · 리터치 13 · 상담 내용 14 · 다음 액션 15 · 계약 금액 16 · 메모 17
const C = { prob: 11, contact: 12, retouch: 13, consult: 14, next: 15, memo: 17 };
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const sheetDate = (iso) => { const [y, m, d] = iso.split("-"); return `${y}. ${+m}. ${+d}.`; };
const dump = () => admin("dump");

(async () => {
  await admin("append", { cells: { 0: "2026-11-01 09:00", 1: "기록고객", 2: "010-7300-0001", 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)" } });
  await admin("append", { cells: { 0: "2026-11-01 09:00", 1: "충돌고객", 2: "010-7300-0002", 5: "영상 제작", 6: "홈페이지", 10: "이익재(Ian)", 14: "[11.02 10:00 Ian] 원래 기록" } });
  const rowOf = async (name) => { const d = await dump(); const i = d.rows.findIndex((r) => r[1] === name); return { i, r: d.rows[i], d }; };

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const search = async (q) => { await p.getByLabel("리드 검색").fill(q); await p.waitForTimeout(250); };
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  // 1) 여러 칸을 한 번에 저장
  await search("7300-0001");
  await p.getByRole("button", { name: "기록고객", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  ok("저장할 내용이 없으면 저장 버튼 비활성", await p.getByRole("button", { name: "시트에 저장" }).isDisabled());
  await p.getByRole("group", { name: "기록 유형" }).getByRole("button", { name: "미팅" }).click();
  await p.getByLabel("상담 내용 추가").fill("첫 미팅: 단가 협의");
  ok("상담 내용을 쓰면 최근 연락일이 오늘로 채워짐", (await p.getByLabel("최근 연락일").inputValue()) === todayKst());
  await p.getByLabel("다음 액션").fill("견적 발송");
  await p.getByLabel("가능성(%)").fill("30");
  await p.getByLabel("리터치 일정").fill("2026-11-20");
  await p.getByLabel("메모", { exact: true }).fill("VIP");
  await p.getByRole("button", { name: "시트에 저장" }).click();
  await p.waitForSelector("text=시트에 저장했습니다");
  let { r, i, d } = await rowOf("기록고객");
  ok("시트: 가능성 30%", r[C.prob] === "30%", r[C.prob]);
  ok("시트: 최근 연락일 = 오늘", r[C.contact] === sheetDate(todayKst()), r[C.contact]);
  ok("시트: 리터치 일정 2026. 11. 20.", r[C.retouch] === "2026. 11. 20.", r[C.retouch]);
  ok("시트: 상담 내용 [날짜 시간 Connor] (미팅) 첫 미팅: 단가 협의", /^\[\d\d\.\d\d \d\d:\d\d Connor\] \(미팅\) 첫 미팅: 단가 협의$/.test(r[C.consult]), r[C.consult]);
  ok("시트: 다음 액션·메모", r[C.next] === "견적 발송" && r[C.memo] === "VIP");
  ok("자동 입력 칸(상호·연락처)은 그대로", r[1] === "기록고객" && r[2] === "010-7300-0001");
  const logs = d.log.filter((l) => l[2] === String(i + 1));
  ok("수정 기록 6줄(바뀐 칸마다 1줄) · 사용자 Connor", logs.length === 6 && logs.every((l) => l[1] === "김세현(Connor)" && l[7] === "ok"), String(logs.length));
  ok("저장 직후 타임라인에 1차 컨택(미팅) 표시", await until(async () => /1차 컨택 미팅 첫 미팅: 단가 협의/.test((await p.getByRole("list", { name: "상담 히스토리" }).innerText()).replace(/\s+/g, " "))));
  ok("저장 후 바뀐 내용이 없으면 버튼 다시 비활성", await p.getByRole("button", { name: "시트에 저장" }).isDisabled());

  // 2) 이어 쓰기(앞 기록 유지)
  await p.getByLabel("상담 내용 추가").fill("두 번째: 견적 확인");
  await p.getByRole("button", { name: "시트에 저장" }).click();
  await until(async () => ((await rowOf("기록고객")).r[C.consult].split("\n").length === 2));
  ({ r } = await rowOf("기록고객"));
  const lines = r[C.consult].split("\n");
  ok("이어 쓰기: 2줄, 앞 줄 유지, 고른 유형(미팅)은 다음 기록에도 유지", lines.length === 2 && /\(미팅\) 첫 미팅: 단가 협의$/.test(lines[0]) && /\(미팅\) 두 번째: 견적 확인$/.test(lines[1]), lines.join(" | "));
  await p.keyboard.press("Escape");

  // 3) 충돌: 폼을 연 뒤 시트에서 같은 칸이 먼저 바뀌면 덮어쓰지 않는다
  await search("7300-0002");
  await p.getByRole("button", { name: "충돌고객", exact: true }).click();
  await p.waitForSelector('[aria-label="상담 기록"]');
  const { i: ci } = await rowOf("충돌고객");
  await admin("race", { row: ci + 1, col: C.consult + 1, value: "[11.03 09:00 Ian] 다른 사람이 먼저 쓴 기록" });
  await p.getByLabel("상담 내용 추가").fill("내가 쓰려던 기록");
  await p.getByRole("button", { name: "시트에 저장" }).click();
  ok("충돌 안내가 뜸", await until(async () => (await p.getByRole("alert").filter({ hasText: /바뀌|먼저|충돌/ }).count()) >= 1));
  ({ r } = await rowOf("충돌고객"));
  ok("시트: 먼저 쓴 내용이 그대로, 내 기록은 쓰지 않음", r[C.consult] === "[11.03 09:00 Ian] 다른 사람이 먼저 쓴 기록", r[C.consult]);

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
