# Core Baalda 로컬 작업 공간

Core Sales의 **실무 → 팀 지식창고**(`/knowledge`)에서 연결한다.

- Baalda 서버: `http://localhost:4310`
- 현재 실행 중인 인트라넷: `http://127.0.0.1:3020/knowledge`
- 고정 원본: `naveedharri/baalda@90929b5a68de3f5347cbf2084ee672dd41264234`
- Windows 클라이언트: `v0.1.112`
- Docker 프로젝트: `core-baalda`; 데이터 볼륨: `core-baalda_pgdata`

## 실행

프로젝트 루트에서 PowerShell로 실행한다.

```powershell
.\services\baalda\install.ps1 # 최초 소스 다운로드·비밀키 생성·빌드·기동
.\services\baalda\start.ps1   # 재시작
.\services\baalda\stop.ps1    # 데이터 보존하며 중지
.\services\baalda\backup.ps1  # backups/에 PostgreSQL custom-format dump
```

`install.ps1`은 기존 `.env`를 보존하고 원본 커밋이 다르면 중단한다.
`upstream/`, `local/`, `backups/`, `.env`는 Git에서 제외된다.
인트라넷 `.env.local`에는 `BAALDA_SERVER_URL=http://localhost:4310`이 설정돼 있다.
이 변수가 없거나 잘못되면 화면은 **서버 미설정**을 표시한다.
변경한 환경변수는 Next 서버를 다시 시작해야 반영된다.

## Windows 앱 연결

공식 설치 파일은 `local/Baalda_0.1.112_x64-setup.exe`에 다운로드돼 있다.
이 작업에서는 실행 명령이 자동 승인 검토에 거부돼 **Windows 앱 설치는 완료되지 않았다**.
설치 파일을 직접 실행한 뒤 팀 지식창고의 **Baalda 앱 연결**을 누른다.
앱에서 서버 주소를 확인하고 계정을 만들거나 로그인한다. 인트라넷과 계정은 별도다.

로컬 검증 계정은 `local/test-account.json`에 있으며 비밀번호를 포함하므로 공유·커밋하지 않는다.
검증 전용 Vault 이름은 **Core 설치 검증**이다. 실제 업무용 계정·Vault는 별도로 만든다.

## 검증 재실행

```powershell
.\services\baalda\verify.ps1
.\services\baalda\verify-live.ps1
# 서버와 DB 재시작 뒤 기존 문서 내용·ID 확인
.\services\baalda\verify-live.ps1 -CheckPersistence
```

회귀 테스트는 별도 Compose 프로젝트 `core-baalda-verification`의 임시 DB만 초기화한다.
운영 `pgdata`를 테스트 DB로 쓰지 않는다. 서버 117개·데스크톱 로직 52개 테스트를 실행한다.
라이브 검증은 실제 로컬 서버에 전용 계정·Vault·문서를 생성하고 MCP와 WebSocket을 사용한다.
다시 실행하면 테스트 문서·토큰이 추가될 수 있으며 업무 데이터에는 접근하지 않는다.
결과는 `local/live-result.json`에 저장된다.

실행 결과와 한계는 [VERIFICATION.md](./VERIFICATION.md)를 참고한다.

## 데이터·운영

DB 포트는 호스트에 공개하지 않으며 API도 `127.0.0.1:4310`에만 바인딩한다.
첨부파일은 PostgreSQL에 저장한다. 과금·외부 OAuth·Vault Key 기능은 비활성 상태다.
로컬 HTTP 검증용이므로 다른 PC에서 이 주소로 접속할 수 없다.
사내 배포 시 서버의 접근 가능한 HTTPS 주소, WebSocket 프록시, `BETTER_AUTH_URL`과
인트라넷의 `BAALDA_SERVER_URL`을 함께 변경해야 한다. Vercel에서 localhost는 사용자 PC가 아니다.

정상 중지는 `stop.ps1`을 사용한다. `docker compose down -v`는 데이터 볼륨을 삭제하므로 사용하지 않는다.
백업은 `backups/*.dump`와 `.env`를 별도로 안전하게 보관한다. `.env`는 백업 파일 안에 포함되지 않는다.
복원은 서버를 중지하고 **새 DB**에 `pg_restore`한 뒤 확인하고 전환한다. 실행 중인 DB를 덮어쓰지 않는다.

원본 코드 라이선스는 Apache-2.0이며 `ee/`와 Baalda 상표는 별도 정책을 따른다.
원본 소스는 수정하지 않았고 Docker 런타임 환경과 인트라넷 안내 화면으로 연결했다.
