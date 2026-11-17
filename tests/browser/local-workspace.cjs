// 시트 연동·팀 저장소가 없는 서버: 화면 설정은 이 브라우저에만 저장되고, 안내 문구가 그렇게 말해야 한다.
const { chromium } = require("../support/pw.cjs");
const BASE = "http://localhost:3010";
let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fail++; };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1200 } })).newPage();
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "화면 설정" }).click();
  const d = p.getByRole("dialog", { name: "화면 설정" });
  await d.waitFor();
  const st = d.getByRole("status", { name: "저장 상태" });
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && /불러오는 중/.test(await st.innerText())) await p.waitForTimeout(250);
  ok("안내: 팀 공용 저장소가 없어 이 브라우저에만 적용", /이 브라우저에만 적용/.test(await st.innerText()), await st.innerText());
  ok("설명도 '이 브라우저에서 보이는 화면만'", (await d.innerText()).includes("이 브라우저에서 보이는 화면만 바뀝니다"));
  await d.getByRole("tab", { name: "사이드바 메뉴" }).click();
  await d.getByRole("checkbox", { name: "팀 표시" }).click();
  await p.keyboard.press("Escape");
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: "화면 설정" }).click();
  await d.waitFor();
  await d.getByRole("tab", { name: "사이드바 메뉴" }).click();
  ok("새로고침해도 이 브라우저의 설정이 유지됨(팀 표시)", await d.getByRole("checkbox", { name: "팀 표시" }).isChecked());
  await b.close();
  console.log(fail ? `FAIL ${fail}` : "ALL PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
