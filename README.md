This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 이 저장소의 히스토리

이 저장소는 2026-10-23에 GitHub에 올렸습니다. 그 전에는 이 프로젝트에 git이 없어서 **실제 커밋 기록이 없습니다.**
올리는 시점의 파일을 기능 단위로 나눠 다시 쌓은 **재구성 히스토리**이고, 커밋 날짜는 실제 작업일이 아니라 올린 날입니다.
앞쪽 커밋은 뒤쪽 커밋의 파일을 참조하므로 단독으로는 빌드되지 않을 수 있습니다.
이 안내를 추가한 커밋 이후부터가 실제 변경 기록입니다.

## 환경변수 (AI 모드)

에이전트 회의실의 AI 모드는 서버 환경변수가 모두 있어야 열립니다. 하나라도 없으면 호출이 닫힙니다(503).

| 이름 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 (서버 전용, 클라이언트로 내보내지 않음) |
| `ROOM_PASSCODE` | 회의실 비밀번호. 로그인이 없는 앱이라 이 값으로 호출을 막는다 |
| `ROOM_DAILY_CAP` | (선택) 인스턴스별 일일 호출 상한, 기본 300 |
| `ROOM_DISABLE_FALLBACK` | (선택) `1`이면 안전 거절 시 서버 폴백을 끈다 |

Vercel: `vercel env add ANTHROPIC_API_KEY production`. 로컬: `.env.local`에 같은 이름으로 넣는다(커밋되지 않음).

## 환경변수 (고객사 AI 조사)

고객사 화면의 **AI 조사** 버튼(DeepSeek 웹 검색 + 사이트 읽기)은 아래 값이 모두 있어야 열립니다. 없으면 503으로 닫힙니다. 로그인이 없는 앱이라 `ROOM_PASSCODE`를 맞춘 요청만 처리합니다.

| 이름 | 설명 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 키 (서버 전용). platform.deepseek.com에서 발급, 사용한 만큼 과금(토큰 + 검색·페이지 읽기 호출료) |
| `ROOM_PASSCODE` | 에이전트 회의실과 같은 비밀번호를 공유한다 |
| `RESEARCH_DAILY_CAP` | (선택) 인스턴스별 일일 조사 상한, 기본 50 |

결과는 초안으로만 보여 주고 고객사 기록은 바꾸지 않습니다. 회사 이름과 사이트 주소가 DeepSeek 서버로 전송됩니다.

