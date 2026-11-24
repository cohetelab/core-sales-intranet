// 성사 이유: 계약 전환 창에서 이유를 고르면 시트 상담 내용에 줄이 남고, 리포트에서 진 이유와 한 표로 비교된다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const D = 86400000;
const stamp = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
const C = { stage: 4, consult: 14, contract: 16 };

(async () => {
  const now = Date.now();
  const S = (name, ph) => admin("append", { cells: { 0: stamp(now - 3 * D), 1: name, 2: ph, 5: "영상 제작", 6: "홈페이지" } });
  await S("성사확인A", "010-8100-0001");
  await S("성사확인B", "010-8100-0002");
  await S("칸반성사", "010-8100-0003");

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const rowOf = async (name) => (await admin("dump")).rows.filter((r) => r[1] === name).slice(-1)[0];
  const lines = (r) => (r[C.consult] || "").split("\n");

  await p.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");

  // 1) 이유를 골라서 계약 전환 (금액 + 성사 이유)
  await p.getByLabel("리드 검색").fill("성사확인A"); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "성사확인A 계약으로 전환" }).click();
  const dlg = p.getByRole("alertdialog");
  ok("계약 전환 창에 '성사 이유(선택)' 선택칸", (await dlg.innerText()).includes("성사 이유(선택)") && (await dlg.getByRole("combobox", { name: "성사 이유" }).count()) === 1);
  await dlg.getByLabel("계약 금액(원)").fill("2090000");
  await dlg.getByRole("combobox", { name: "성사 이유" }).click();
  const opts = await p.getByRole("option").allInnerTexts();
  ok("선택지: 이유 기록 안 함 + 5가지", opts.map((t) => t.trim()).join() === "이유 기록 안 함,가격,포트폴리오,응대 속도,추천·재계약,기타", opts.join());
  await p.getByRole("option", { name: "가격" }).click();
  await dlg.getByRole("button", { name: "계약으로 전환" }).click();
  ok("시트: 단계 = 성사 · 계약 금액 ₩2,090,000", await until(async () => { const r = await rowOf("성사확인A"); return r[C.stage] === "성사" && r[C.contract] === "₩2,090,000"; }));
  const A = await rowOf("성사확인A");
  ok("시트 상담 내용: '(단계) 리드 → 성사' 줄 다음에 '(메모) 성사 이유: 가격' 줄", lines(A).length === 2 && /\(단계\) 리드 → 성사$/.test(lines(A)[0]) && /\[\d\d\.\d\d \d\d:\d\d Connor\] \(메모\) 성사 이유: 가격$/.test(lines(A)[1]), A[C.consult]);

  // 2) 이유 없이 전환 → 단계 줄만
  await p.getByLabel("리드 검색").fill("성사확인B"); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "성사확인B 계약으로 전환" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "계약으로 전환" }).click();
  ok("시트: 이유 없이 전환하면 단계 줄만 남음", await until(async () => { const r = await rowOf("성사확인B"); return r[C.stage] === "성사" && lines(r).length === 1 && /\(단계\) 리드 → 성사$/.test(lines(r)[0]) && !/성사 이유/.test(r[C.consult]); }), (await rowOf("성사확인B"))[C.consult]);

  // 3) 서버는 목록에 없는 이유를 거절
  const bad = await ctx.request.post(`${BASE}/api/leads/convert`, { headers: { origin: BASE }, data: { id: "lead-abc123", reason: "아무거나" } });
  ok("목록에 없는 성사 이유는 400", bad.status() === 400, String(bad.status()));

  // 3-2) 칸반에서 계약 열로 옮겨도 같은 창이 뜨고, 이유·금액이 기록된다
  await p.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
  await p.getByLabel("딜 검색").fill("칸반성사"); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "칸반성사 카드" }).dragTo(p.locator('[data-stage="won"]'));
  const kd = p.getByRole("alertdialog");
  ok("칸반: 계약 열로 옮기면 성사 이유 선택칸이 있는 계약 전환 창이 뜸", await until(async () => (await kd.count()) === 1 && (await kd.getByRole("combobox", { name: "성사 이유" }).count()) === 1 && (await kd.innerText()).includes("칸반성사")));
  ok("창이 떠 있는 동안 시트 단계는 그대로(옮겨지지 않음)", (await rowOf("칸반성사"))[C.stage] === "");
  await kd.getByLabel("계약 금액(원)").fill("1500000");
  await kd.getByRole("combobox", { name: "성사 이유" }).click();
  await p.getByRole("option", { name: "응대 속도" }).click();
  await kd.getByRole("button", { name: "계약으로 전환" }).click();
  ok("칸반 계약: 시트 단계 = 성사 · 금액 ₩1,500,000", await until(async () => { const r = await rowOf("칸반성사"); return r[C.stage] === "성사" && r[C.contract] === "₩1,500,000"; }));
  const K = await rowOf("칸반성사");
  ok("칸반 계약: 단계 줄 다음에 '(메모) 성사 이유: 응대 속도' 줄", lines(K).length === 2 && /\(단계\) 리드 → 성사$/.test(lines(K)[0]) && /\(메모\) 성사 이유: 응대 속도$/.test(lines(K)[1]), K[C.consult]);
  ok("칸반 계약: 카드가 계약 열로 이동", await until(async () => (await p.locator('[data-stage="won"]').getByRole("button", { name: "칸반성사 카드" }).count()) === 1));

  // 4) 리포트: 이기고 지는 이유 비교
  await p.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  const reg = p.getByRole("region", { name: "이기고 지는 이유" });
  await reg.waitFor();
  const t = (sel) => reg.locator(sel).innerText().then((s) => s.replace(/\s+/g, " "));
  ok("가격 줄: 이긴 건수 1건(2,090,000원)", await until(async () => (await t('tr[data-reason="가격"]')).includes("1건 (2,090,000원)")), await t('tr[data-reason="가격"]'));
  ok("이유 기록 안 함 줄: 이긴 건수 = 이유 없이 전환한 B + 시트에 원래 있던 계약", (await t('tr[data-reason="none"]')).includes("2건"), await t('tr[data-reason="none"]'));
  ok("진 이유(종료 사유)와 한 표: 표 머리글에 이긴 건수·진 건수", (await t("thead")).includes("이긴 건수") && (await t("thead")).includes("진 건수"));
  ok("이김 합계 4건(A·B·칸반·시트 계약)", (await reg.innerText()).replace(/\s+/g, " ").includes("이김 4건"), (await reg.innerText()).replace(/\s+/g, " ").slice(0, 120));
  ok("종료 사유 섹션도 그대로 있음", (await p.getByRole("region", { name: "종료 사유" }).count()) + (await p.locator("section[aria-label='종료 사유']").count()) >= 1);

  ok("화면 오류 없음", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
