// 브라우저 테스트용 Playwright 불러오기. 이 저장소에는 playwright 의존성이 없어서 아래 순서로 찾는다.
//   1) 환경변수 PLAYWRIGHT_PATH(playwright 패키지 폴더)  2) 설치된 playwright  3) 같은 작업 공간의 corerank-references
// 브라우저는 기본으로 Microsoft Edge를 쓰고, 환경변수 PW_CHANNEL(예: chrome)로 바꿀 수 있다.
const fs = require("fs");
const path = require("path");

const candidates = [
  process.env.PLAYWRIGHT_PATH,
  "playwright",
  path.join(__dirname, "../../../corerank-references/node_modules/playwright"),
].filter(Boolean);

let pw = null;
for (const c of candidates) {
  try {
    pw = require(c);
    break;
  } catch {
    // 다음 후보
  }
}
if (!pw) throw new Error("playwright를 찾을 수 없습니다. PLAYWRIGHT_PATH 환경변수에 playwright 패키지 폴더를 지정해 주세요.");

const { chromium } = pw;
const launch = chromium.launch.bind(chromium);
chromium.launch = (opts = {}) => launch({ channel: process.env.PW_CHANNEL || "msedge", ...opts });

// 스크린샷 저장 위치(tests/out, git에는 올리지 않는다)
const outDir = path.join(__dirname, "../out");
const out = (name) => {
  fs.mkdirSync(outDir, { recursive: true });
  return path.join(outDir, name);
};

module.exports = { ...pw, chromium, out };
