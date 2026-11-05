# 고객사 Google Drive 연결 설정

1. Supabase SQL 편집기에서 `supabase/google-drive.sql`을 실행합니다.
2. Google Cloud에서 Drive API를 켜고 웹 OAuth 클라이언트를 만듭니다. 승인된 리디렉션 URI에 `https://core-sales-intranet.vercel.app/api/google-drive/callback`을 등록합니다.
3. Vercel 프로젝트와 로컬 `.env.local`에 아래 서버 환경변수를 설정합니다.

| 변수 | 값 |
| --- | --- |
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth 웹 클라이언트 ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth 클라이언트 보안 비밀 |
| `GOOGLE_DRIVE_REDIRECT_URI` | 위의 콜백 URL과 정확히 같은 값 |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | 고객사 상위 폴더 URL의 `/folders/` 뒤 ID |
| `GOOGLE_DRIVE_TOKEN_KEY` | 32바이트 난수를 64자리 16진수로 표현한 암호화 키 |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | 서버 전용 Supabase 접속 정보 |

`GOOGLE_DRIVE_TOKEN_KEY`는 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`로 생성할 수 있습니다. 변경하면 기존 연결은 다시 해야 합니다.

각 직원은 자신의 Google 계정으로 연결합니다. 이 기능은 파일 메타데이터만 읽는 `drive.metadata.readonly` 범위를 사용하며, Google의 제한된 범위 검증 요건이 적용될 수 있습니다. OAuth 앱의 테스트 사용자 또는 게시 상태도 확인하세요. 설정 전에는 화면에 설정 안내가 표시됩니다.
