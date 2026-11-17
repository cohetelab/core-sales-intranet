# 자동 테스트

시트 연동 화면(홈·리드 인박스·파이프라인·리포트 등)과 계산 규칙을 검사합니다. **가짜 구글 시트와 가짜 Slack만 쓰고, 진짜 시트·진짜 Slack에는 아무것도 보내지 않습니다.**

## 실행
```powershell
npm run test:unit        # 단위 테스트만(몇 초, 서버·브라우저 불필요)
npm test                 # 단위 + 브라우저 전체(약 5분)
node tests/run-all.cjs --only mine   # 이름에 'mine'이 들어간 테스트만
```
브라우저 테스트는 실행기가 알아서 가짜 시트 서버(4020), 필요하면 가짜 Slack(4030), 개발 서버(3010)를 띄우고 끕니다.
**실행 전에 3010·4020·4030·4040 포트를 쓰는 프로세스가 없어야 합니다.**

## 준비물
- Node.js, 그리고 Playwright. 이 저장소에는 playwright가 설치돼 있지 않아서 아래 순서로 찾습니다.
  1. 환경변수 `PLAYWRIGHT_PATH` (playwright 패키지 폴더)
  2. 설치된 `playwright`
  3. 같은 작업 공간의 `../corerank-references/node_modules/playwright`
- 브라우저는 기본으로 Microsoft Edge입니다. 바꾸려면 `PW_CHANNEL=chrome` 처럼 지정합니다.
- 스크린샷은 `tests/out/` 에 저장됩니다(git에는 올라가지 않습니다).

## 구성
| 폴더 | 내용 |
|---|---|
| `tests/unit/*-test.cjs` | `lib/*.ts`의 계산 규칙(점검, 정리 대기, 종료 사유, 응답 속도, 리포트, 알림 글, 화면 설정, 시트 읽기 등) |
| `tests/browser/*-ui.cjs` | 가짜 시트로 실제 화면을 조작(로그인, 담당 배정, 상담 기록, 파이프라인, 정리 대기함, 리포트, 홈, 화면 설정, Slack 알림 등) |
| `tests/browser/local-*.cjs` | 시트 설정이 없을 때의 샘플 화면 확인 |
| `tests/support/` | 실행기가 쓰는 도구: lib 변환기, Playwright 불러오기, 가짜 시트 서버, 가짜 Slack 서버, 가짜 Supabase Storage 서버 |

팀 공용 화면 설정(`workspace-team-ui`)은 두 번 돌립니다: 파일 저장소로 한 번, 가짜 Supabase Storage 서버로 한 번(실제 `supabase-js` 클라이언트가 버킷 생성·업로드·다운로드를 올바르게 호출하는지 확인). 가짜 서버의 오류 모양은 문서에 없어 추정한 것이라, 진짜 Supabase에서의 동작은 보장하지 않습니다.

가짜 시트 서버는 `integrations/sheet-bridge/Code.gs`(진짜 Apps Script)를 그대로 실행하는 시험 도구(`integrations/sheet-bridge/test/gas-harness.cjs`)를 씁니다. 그래서 충돌 검사, 칸 허용 목록, 기록 탭 같은 Apps Script 쪽 규칙도 함께 검증됩니다.

## 새 테스트 추가
- 규칙(계산)은 `tests/unit/이름-test.cjs`: `const { load } = require("../support/run.cjs"); const m = load("lib파일이름");`
- 화면은 `tests/browser/이름-ui.cjs`: `const { chromium, out } = require("../support/pw.cjs");` 로 시작하고, `tests/run-all.cjs`의 `sheetSuites` 목록에 이름을 추가합니다.
- 화면이 시트에 쓰는 동작은 화면이 **먼저 바뀌고 시트는 조금 뒤에 바뀝니다.** 시트 값을 확인하기 전에 값이 바뀔 때까지 기다려야 합니다(기존 테스트의 `until` 참고).

## 이 테스트가 확인하지 못하는 것
- 진짜 구글 시트의 고유 동작(수식 칸, 날짜 자동 변환, Apps Script 실행 한도·지연)
- 진짜 Slack 전송
- 모바일 화면 미리보기(PC/모바일 전환)와 고객사 화면, 대시보드 요약 카드: 이전에 있던 테스트 파일이 사라져서 지금은 자동 테스트가 없습니다.
- CSV 가져오기 방식(옛 샘플 CSV 파일이 사라져 제외됨)
