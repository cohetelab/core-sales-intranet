# 팀 지식창고 초기 설정

1. 기존 Supabase 프로젝트 SQL Editor에서 `supabase/knowledge.sql`을 실행합니다.
2. 프로젝트의 **Publishable key**를 `.env.local`과 Vercel Production 환경변수 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`에 설정합니다. `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`는 서버에만 둡니다.
3. Supabase Auth URL Configuration의 Site URL을 `https://core-sales-intranet.vercel.app`로 설정하고 Redirect URL에 `https://core-sales-intranet.vercel.app/knowledge`를 추가합니다. 초대 메일 발송 설정도 확인합니다.
4. 관리자는 PowerShell에서 `node --env-file=.env.local scripts/knowledge-invite.mjs employee@example.com`을 실행합니다. 초대와 `knowledge_members` 권한 등록을 함께 수행합니다. 테스트할 때는 로컬 주소를 쓰도록 `KNOWLEDGE_INVITE_REDIRECT_URL`을 설정할 수 있습니다.
5. 직원은 메일의 초대 링크를 열고 `/knowledge`에서 비밀번호를 설정한 뒤 사용합니다. 초대된 계정이어도 `knowledge_members.active = false`면 문서를 볼 수 없습니다.

문서와 폴더는 Supabase에 저장됩니다. 이 화면은 기존 캠페인 메모나 Baalda 로컬 저장소의 내용을 옮기지 않습니다. 동시 수정 시 먼저 저장한 버전만 유지되며, 다른 편집자는 복사 후 최신 문서를 다시 불러올 수 있습니다.
