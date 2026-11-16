const path = require("path");
const { chromium, out } = require("../support/pw.cjs");
const BASE = "http://localhost:3010", FAKE = "http://127.0.0.1:4020", SLACK = "http://127.0.0.1:4030";
const MODE = process.argv[2] || "configured"; // configured | unconfigured | evil
const SECRET = "test-cron-secret-1234567890";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };
const admin = (op, body = {}) => fetch(`${FAKE}/admin/${op}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const slack = (p, body) => fetch(`${SLACK}${p}`, body ? { method: "POST", body: JSON.stringify(body) } : {}).then((r) => r.json().catch(() => null));
const k = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const sd = (ms) => { const [y, m, d] = k(ms).slice(0, 10).split("-"); return `${y}. ${+m}. ${+d}.`; };
const cron = (auth) => fetch(`${BASE}/api/cron/digest`, { headers: auth ? { authorization: auth } : {} });

(async () => {
  await slack("/_reset", {});
  const now = Date.now();
  // 오늘 일정이 있는 Ian 고객(업체명에 위험한 글자 포함)
  await admin("append", { cells: { 0: "2026-11-10 10:00", 1: "<!channel> 위험 & 업체", 2: "010-7700-0001", 5: "영상 제작", 6: "홈페이지", 4: "상담", 10: "이익재(Ian)", 13: sd(now), 15: "<@U123> 연락" } });

  // 1) 크론 경로 보안
  const noAuth = await cron(null), wrong = await cron("Bearer wrong");
  ok("크론: 인증 없음 → 401 · 틀린 비밀 → 401", noAuth.status === 401 && wrong.status === 401, `${noAuth.status}/${wrong.status}`);
  const good = await cron(`Bearer ${SECRET}`);
  const goodJson = await good.json();
  const posts = await slack("/_posts");

  if (MODE === "configured") {
    ok("크론: 올바른 비밀 → 200 · 보냄", good.status === 200 && goodJson.sent === true, JSON.stringify(goodJson));
    ok("Slack에 POST 1건(JSON, text만 있음)", posts.length === 1 && /application\/json/.test(posts[0].type) && Object.keys(JSON.parse(posts[0].body)).join() === "text", posts.length + "건");
    const text = JSON.parse(posts[0].body).text;
    ok("글: 제목·Ian 줄·팀 줄이 있음", text.includes("*오늘의 영업 알림*") && text.includes("*이익재(Ian)*") && text.includes("*팀*"));
    ok("글: 업체명·다음 액션의 특수문자는 이스케이프(<!channel> 전체 알림 방지)", text.includes("&lt;!channel&gt; 위험 &amp; 업체") && text.includes("&lt;@U123&gt; 연락") && !text.includes("<!channel>") && !text.includes("<@U123>"));
    ok("글에 웹훅 주소·연락처가 없음", !text.includes("hooks.slack") && !text.includes("010-"));
  } else {
    ok(`크론: 연결이 없으면(${MODE}) 보내지 않고 not_configured`, good.status === 200 && goodJson.sent === false && goodJson.reason === "not_configured", JSON.stringify(goodJson));
    ok("Slack(또는 외부)으로 아무것도 나가지 않음", posts.length === 0, posts.length + "건");
  }

  // 2) 로그인 필요 경로
  const g0 = await fetch(`${BASE}/api/leads/digest`), p0 = await fetch(`${BASE}/api/leads/digest`, { method: "POST" });
  ok("미리보기·보내기는 로그인 없이는 거부(401/403)", g0.status === 401 && [401, 403].includes(p0.status), `${g0.status}/${p0.status}`);

  // 3) 화면
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1500 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("combobox", { name: "내 이름" }).click(); await p.getByRole("option", { name: "김세현(Connor)" }).click();
  await p.getByLabel("리드 화면 비밀번호").fill("lead-pass"); await p.getByRole("button", { name: "들어가기" }).click();
  await p.waitForSelector("text=시트가 원본입니다");
  await p.waitForSelector("text=Slack 알림");
  const card = p.locator('[data-slot="card"]', { has: p.getByRole("heading", { name: /Slack 알림/ }) });
  const cardText = async () => (await card.innerText()).replace(/\s+/g, " ");
  await p.getByText("오늘 나갈 알림 미리보기").click();
  ok("미리보기에 오늘 나갈 글이 보임", (await p.getByLabel("알림 미리보기").innerText()).includes("*오늘의 영업 알림*"));
  ok("화면 어디에도 웹훅 주소가 없음", !(await p.locator("body").innerHTML()).includes("hooks.slack.com") && !(await p.locator("body").innerHTML()).includes("4030"));

  if (MODE === "configured") {
    ok("상태 '연결됨' · 보내기 버튼 활성", (await cardText()).includes("연결됨") && (await p.getByRole("button", { name: "Slack으로 지금 보내기" }).isEnabled()));
    await p.getByRole("button", { name: "Slack으로 지금 보내기" }).click();
    await p.waitForSelector("text=Slack으로 보냈습니다");
    ok("지금 보내기 → Slack에 2번째 글", (await slack("/_posts")).length === 2);
    await p.getByRole("button", { name: "Slack으로 지금 보내기" }).click();
    ok("연달아 누르면 '방금 보냈습니다'(15초 간격)", await p.getByText("방금 보냈습니다").waitFor({ timeout: 8000 }).then(() => true).catch(() => false) && (await slack("/_posts")).length === 2);
    await p.waitForTimeout(15500);
    await slack("/_mode", { mode: "404" });
    await p.getByRole("button", { name: "Slack으로 지금 보내기" }).click();
    ok("Slack이 404를 돌려주면 이유를 알려 줌(주소 확인 안내)", await p.getByText("웹훅 주소를 찾지 못했습니다").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    const bad = await cron(`Bearer ${SECRET}`);
    ok("크론도 Slack 오류면 502로 실패를 알림(조용히 삼키지 않음)", bad.status === 502, String(bad.status));
  } else {
    ok("상태 '아직 연결 안 됨' · 보내기 버튼 비활성 · 설정 안내", (await cardText()).includes("아직 연결 안 됨") && (await p.getByRole("button", { name: "Slack으로 지금 보내기" }).isDisabled()) && (await cardText()).includes("SLACK_WEBHOOK_URL"));
  }

  ok("페이지 에러 없음", errs.length === 0, errs.join(" | "));
  if (MODE === "configured") { await p.getByText("오늘 나갈 알림 미리보기").scrollIntoViewIfNeeded(); await p.screenshot({ path: out("digest.png"), fullPage: true }); }
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
