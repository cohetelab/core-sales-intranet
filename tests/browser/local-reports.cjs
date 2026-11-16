const path = require("path");
const { chromium } = require("../support/pw.cjs");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.goto("http://localhost:3010/reports", { waitUntil: "networkidle" });
  const n = await p.getByText("팀 쿼터 달성률").count();
  console.log("시트 설정 없을 때 기존 리포트(샘플):", n === 1 ? "✓" : "✗");
  await b.close(); process.exit(n === 1 ? 0 : 1);
})();
