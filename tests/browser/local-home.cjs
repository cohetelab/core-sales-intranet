const path = require("path");
const { chromium } = require("../support/pw.cjs");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.goto("http://localhost:3010/", { waitUntil: "networkidle" });
  const mrr = await p.getByText("계약 MRR").count();
  await p.goto("http://localhost:3010/team", { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
  const note = await p.getByRole("note").filter({ hasText: "샘플 데이터" }).count();
  console.log("시트 설정 없을 때: 기존 홈(계약 MRR)", mrr === 1 ? "✓" : "✗", "| /team 샘플 배너 없음", note === 0 ? "✓" : "✗");
  await b.close(); process.exit(mrr === 1 && note === 0 ? 0 : 1);
})();
