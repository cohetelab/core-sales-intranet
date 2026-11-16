# Slack 영업 알림 설정

평일 오전(한국 시간 9시대)에 Slack 채널로 영업 알림이 자동으로 나갑니다. 시트를 읽기만 하고 아무것도 바꾸지 않습니다.

## 내용
- 영업 담당(Ian·Connor)별: 오늘·내일 일정(지난 일정 포함, 업체명·다음 액션 3건까지), 첫 컨택 기록 없음, 14일 넘게 활동 없음
- 팀: 24시간 넘게 미배정(최근 30일 문의만), 정리 대기(30일 이상), 응답 속도 중앙값
- 홈 맨 아래 "Slack 알림" 카드에서 오늘 나갈 글을 미리 볼 수 있습니다.

## 연결하는 방법 (Slack 메뉴 이름은 바뀔 수 있습니다)
1. Slack에서 알림을 받을 채널을 정합니다.
2. Slack API 사이트에서 앱을 만들고 **Incoming Webhooks**를 켠 뒤, 그 채널로 **웹훅 주소를 추가**합니다. 주소는 `https://hooks.slack.com/services/…` 로 시작합니다.
3. Vercel → 프로젝트 → Settings → Environment Variables 에 **Production** 으로 추가합니다.
   - `SLACK_WEBHOOK_URL` = 위 웹훅 주소 (주소에 비밀이 들어 있으니 다른 곳에 붙여 넣지 마세요)
4. 다시 배포하면 홈의 Slack 알림 카드가 "연결됨"으로 바뀝니다. **"Slack으로 지금 보내기"** 로 한 번 확인하세요.

## 선택 설정
| 환경변수 | 설명 |
|---|---|
| `DIGEST_HIDE_NAMES=1` | 업체명·다음 액션을 빼고 건수만 보냅니다(Slack 쪽에 고객 이름을 두고 싶지 않을 때) |
| `APP_URL` | 글 맨 아래 "인트라넷 열기" 링크 주소(기본은 Vercel 운영 주소) |

## 자동 실행
- `vercel.json` 의 크론이 평일 UTC 00:00(한국 오전 9시)에 `/api/cron/digest` 를 호출합니다. 시간대는 항상 UTC입니다.
- 호출은 `CRON_SECRET` 환경변수가 맞아야만 통과합니다(Vercel이 `Authorization: Bearer …` 로 보냅니다).
- Vercel Hobby 요금제는 하루 1회, 지정한 시(hour) 안의 임의 시각에 실행됩니다. Pro는 분 단위로 정확합니다.
- 크론은 실패해도 다시 시도하지 않고 드물게 두 번 호출될 수 있습니다. 같은 글이 두 번 올 수 있습니다.

## 문제 해결
| 증상 | 원인 |
|---|---|
| 카드가 "아직 연결 안 됨" | `SLACK_WEBHOOK_URL` 이 없거나 `https://hooks.slack.com/services/` 로 시작하지 않음 |
| "Slack이 웹훅 주소를 찾지 못했습니다" | 웹훅을 지웠거나 주소를 잘못 붙임 |
| 자동으로 안 옴 | 크론은 운영(Production) 배포에서만 실행됨. Vercel → Schedules(Cron Jobs) 탭에서 로그 확인 |
