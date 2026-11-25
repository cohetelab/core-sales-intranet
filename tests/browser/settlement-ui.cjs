// 정산 시트: 읽기 전용 연동. 관리자만 볼 수 있고(일반 영업·로그인 전은 막힘), 합계·필터·주의 목록이 시트 값과 맞는다.
// 이 시험은 LEADS_ADMINS=김세현(Connor) · LEADS_ADMIN_PASSCODE=admin-pass · 가짜 정산 시트(4021)로 서버를 띄워서 돌린다.
const { chromium } = require("../support/pw.cjs");
const { EXPECT } = require("../support/settlement-fixture.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4021";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const CON = "김세현(Connor)", IAN = "이익재(Ian)";
const fmt = (v) => `${v.toLocaleString("ko-KR")}원`;

(async () => {
  const b = await chromium.launch();
  const H = { origin: BASE };
  const logs = async () => (await fetch(`${FAKE}/_log`)).json();
  const loginApi = (ctx, name, passcode) => ctx.request.post(`${BASE}/api/leads/session`, { headers: H, data: { name, passcode } });

  // 1) API 접근 제어
  const anon = await b.newContext();
  const a0 = await anon.request.get(`${BASE}/api/leads/settlement`);
  ok("로그인 전: 401", a0.status() === 401);
  const cIan = await b.newContext();
  await loginApi(cIan, IAN, "lead-pass");
  const a1 = await cIan.request.get(`${BASE}/api/leads/settlement`);
  ok("일반 영업(Ian): 403 admin_only", a1.status() === 403 && (await a1.json()).error === "admin_only");
  ok("거절된 요청은 시트를 읽지 않음", (await logs()).length === 0, JSON.stringify(await logs()));
  const cCon = await b.newContext();
  await loginApi(cCon, CON, "admin-pass");
  const a2 = await cCon.request.get(`${BASE}/api/leads/settlement`);
  const body = await a2.json();
  ok("관리자(Connor): 200 · 58행 · 빈 행 1 · 합계 행 1 건너뜀", a2.ok() && body.rows.length === EXPECT.rows && body.skipped.blank === 1 && body.skipped.summary === 1, JSON.stringify(body.skipped));
  ok("응답에 토큰·주소 같은 비밀은 없음", !/settle-token|127\.0\.0\.1:4021|SETTLEMENT/.test(JSON.stringify(body)));
  ok("합계 행의 금액(9,999,999)은 어디에도 섞이지 않음", !JSON.stringify(body.rows).includes("9999999"));

  // 2) 화면: 일반 영업은 '관리자만'
  const mk = async (name, pass) => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1500 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/settlement-sheet`, { waitUntil: "networkidle" });
    await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name }).click();
    await p.getByLabel("리드 화면 비밀번호").fill(pass); await p.getByRole("button", { name: "들어가기" }).click();
    return p;
  };
  const until = async (p, fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
  const I = await mk(IAN, "lead-pass");
  ok("Ian 화면: 로그인 후 '관리자만 볼 수 있습니다'", await until(I, async () => (await I.getByText("관리자만 볼 수 있습니다").count()) === 1));
  ok("Ian 화면에는 정산 금액이 전혀 없음", !(await I.locator("body").innerText()).includes("지급액") || (await I.getByRole("table").count()) === 0);

  // 3) 화면: 관리자
  const p = await mk(CON, "admin-pass");
  await p.getByRole("region", { name: "정산 시트 요약" }).waitFor({ timeout: 30000 });
  const card = async (label) => (await p.getByTestId(`card-${label}`).innerText()).trim();
  const sub = async (label) => (await p.getByTestId(`card-${label}`).locator("xpath=following-sibling::p").innerText()).replace(/\s+/g, " ");
  ok("총 지급액 5,951,040원(환불 제외)", (await card("총 지급액")) === fmt(EXPECT.payout), await card("총 지급액"));
  ok("결제 완료 3,349,350원 · 33건", (await card("결제 완료")) === fmt(EXPECT.paid) && (await sub("결제 완료")).includes(`${EXPECT.paidRows}건`));
  ok("미결제 2,601,690원 · 24건", (await card("미결제")) === fmt(EXPECT.unpaid) && (await sub("미결제")).includes(`${EXPECT.unpaidRows}건`));
  ok("광고주 계약 매출 9,090,000원(오류값·환불 제외)", (await card("광고주 계약 매출")) === fmt(EXPECT.revenue), await card("광고주 계약 매출"));
  ok("총 지급액 = 결제 완료 + 미결제", EXPECT.payout === EXPECT.paid + EXPECT.unpaid);
  ok("읽기 전용 안내와 탭 이름·마지막 확인 시각", (await p.locator("body").innerText()).includes("읽기만 하고 시트를 바꾸지 않습니다") && (await p.locator("body").innerText()).includes("마지막 확인"));
  ok("지급액 계산 기준 안내(공제 후 → 비용)", (await p.locator("body").innerText()).includes("공제 후 금액’이 있으면 그 값") || (await p.locator("body").innerText()).includes("공제 후 금액"));

  // 주의 목록
  const det = p.locator("details[aria-label='데이터 확인 필요']");
  ok("시트 데이터 확인 필요 4종 안내", (await det.locator("summary").innerText()).includes("4종"), (await det.locator("summary").innerText()).replace(/\s+/g, " "));
  await det.locator("summary").click();
  const w = async (id) => (await det.locator(`li[data-warning="${id}"]`).count()) ? (await det.locator(`li[data-warning="${id}"]`).innerText()).replace(/\s+/g, " ") : "";
  ok("주의: 계약 매출 오류값 1행 · 합계 행 1행 · 업로드 칸 파일명 1행 · 결제 여부 빈칸 3행", (await w("bad_revenue")).includes("1행") && (await w("summary")).includes("1행") && (await w("upload_filename")).includes("1행") && (await w("status_unset")).includes("3행"), [await w("bad_revenue"), await w("status_unset")].join(" | "));
  ok("주의 목록에는 이름이 없고 시트 행 번호만", !/가수|나수|다수|라수|마수/.test(await det.innerText()) && /시트 행 \d+/.test(await det.innerText()));
  ok("결제일이 읽히는 행은 경고 대상이 아님(결제 완료인데 결제일 없음 항목 없음)", (await det.locator('li[data-warning="paid_no_date"]').count()) === 0);

  // 표 · 페이지
  const rowsOnPage = () => p.locator("tbody tr[data-row]").count();
  ok("표: 한 페이지 50행 · 1 / 2", (await rowsOnPage()) === 50 && (await p.getByText("1 / 2").count()) === 1);
  await p.getByRole("button", { name: "다음 페이지" }).click();
  ok("2페이지: 나머지 8행", (await rowsOnPage()) === 8 && (await p.getByText("2 / 2").count()) === 1);
  await p.getByRole("button", { name: "이전 페이지" }).click();
  ok("표시 건수 58 / 전체 58", (await p.getByRole("status", { name: "표시 건수" }).innerText()).replace(/\s+/g, " ").includes("표시 58건 · 전체 58건"));

  // 필터
  await p.getByRole("button", { name: "구분 법인B", exact: true }).click();
  ok("구분 법인B: 6건 · 카드도 그 구분 합계(1,048,350원)", (await p.getByRole("status", { name: "표시 건수" }).innerText()).replace(/\s+/g, " ").includes(`표시 ${EXPECT.sourceB}건`) && (await card("총 지급액")) === fmt(1048350), await card("총 지급액"));
  await p.getByRole("button", { name: "전체 구분", exact: true }).click();
  await p.getByRole("button", { name: "상태 환불", exact: true }).click();
  ok("상태 환불: 1건", (await rowsOnPage()) === 1 && (await p.locator("tbody").innerText()).includes("라수1"));
  await p.getByRole("button", { name: "상태 미결제", exact: true }).click();
  ok("상태 미결제: 24건(환불 제외)", (await p.getByRole("status", { name: "표시 건수" }).innerText()).replace(/\s+/g, " ").includes(`표시 ${EXPECT.unpaidRows}건`));
  await p.getByRole("button", { name: "상태 전체", exact: true }).click();
  await p.getByLabel("정산 검색").fill("마수1");
  ok("검색: 1건 · 업로드 칸의 파일명은 '확인'으로 표시", (await rowsOnPage()) === 1 && (await p.locator("tbody").innerText()).includes("확인"));
  await p.getByLabel("정산 검색").fill("나수1");
  ok("공제 후 금액이 빈 행은 '비용 기준 200,000원' 안내", (await p.locator("tbody").innerText()).replace(/\s+/g, " ").includes("비용 기준 200,000원"));
  await p.getByLabel("정산 검색").fill("");

  // 새로고침 · 읽기 전용
  const before = (await logs()).length;
  await p.getByRole("button", { name: "새로고침" }).click();
  ok("새로고침: 시트를 다시 읽음(캐시 우회)", await until(p, async () => (await logs()).length > before));
  ok("가짜 시트 서버가 받은 요청은 전부 read(쓰기 없음)", (await logs()).length > 0 && (await logs()).every((l) => l.action === "read"), JSON.stringify(await logs()));

  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
