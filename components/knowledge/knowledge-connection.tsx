"use client";

import { useEffect, useState } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "checking" | "ready" | "unreachable" | "unconfigured";
const labels: Record<Status, string> = {
  checking: "연결 확인 중",
  ready: "서버 연결됨",
  unreachable: "서버에 연결할 수 없음",
  unconfigured: "서버 미설정",
};

async function fetchStatus(signal?: AbortSignal): Promise<Status> {
  try {
    const response = await fetch("/api/knowledge/health", { cache: "no-store", signal });
    const data = await response.json();
    return ["ready", "unreachable", "unconfigured"].includes(data.status) ? data.status : "unreachable";
  } catch {
    return "unreachable";
  }
}

export function KnowledgeConnection({ serverUrl }: { serverUrl: string | null }) {
  const [status, setStatus] = useState<Status>(serverUrl ? "checking" : "unconfigured");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (!serverUrl) return;
    const controller = new AbortController();
    void fetchStatus(controller.signal).then((next) => {
      if (!controller.signal.aborted) setStatus(next);
    });
    return () => controller.abort();
  }, [serverUrl]);

  async function check() {
    setStatus("checking");
    setStatus(await fetchStatus());
  }

  async function copyAddress() {
    if (!serverUrl) return;
    try {
      await navigator.clipboard.writeText(serverUrl);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">팀 지식창고</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          업무 문서를 내 컴퓨터의 Markdown 파일로 보관하고, Baalda 앱에서 팀원과 함께 편집하세요.
          로컬 AI가 수정한 파일도 같은 작업 공간에 반영됩니다.
        </p>
      </div>

      <section aria-labelledby="connection-title" className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 id="connection-title" className="font-medium">Baalda 작업 공간 연결</h2>
            <p role="status" aria-live="polite" className={`text-sm ${status === "ready" ? "text-foreground" : "text-muted-foreground"}`}>
              {labels[status]}
            </p>
          </div>
          <Button variant="ghost" size="sm" disabled={!serverUrl || status === "checking"} onClick={() => void check()}>
            <RefreshCwIcon className="size-4" />다시 확인
          </Button>
        </div>
        {serverUrl ? (
          <>
            <div className="my-5 flex flex-wrap items-center gap-2 rounded-md bg-muted p-3">
              <code className="min-w-0 flex-1 break-all text-sm">{serverUrl}</code>
              <Button variant="ghost" size="sm" onClick={() => void copyAddress()}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? "주소 복사됨" : "주소 복사"}
              </Button>
            </div>
            {copyError && <p role="alert" className="mb-3 text-sm text-destructive">자동 복사가 되지 않았습니다. 위 주소를 선택해 복사하세요.</p>}
            <div className="flex flex-wrap gap-3">
              <Button asChild><a href={`baalda://connect?server=${encodeURIComponent(serverUrl)}`}><ArrowUpRightIcon className="size-4" />Baalda 앱 연결</a></Button>
              <Button variant="outline" asChild><a href="https://github.com/naveedharri/baalda/releases/download/v0.1.112/Baalda_0.1.112_x64-setup.exe"><DownloadIcon className="size-4" />Windows 앱 다운로드</a></Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">앱을 먼저 설치하세요. 연결 버튼을 누르면 Baalda에서 서버 주소를 확인한 뒤 로그인합니다. 서버 연결 상태는 앱 설치 여부를 뜻하지 않습니다.</p>
          </>
        ) : <p className="mt-4 text-sm leading-6 text-muted-foreground">작업 공간 서버가 아직 설정되지 않았습니다. 관리자에게 연결 주소 설정을 요청하세요.</p>}
        {status === "unreachable" && <p role="alert" className="mt-4 text-sm leading-6 text-destructive">서버가 실행 중인지 확인한 뒤 다시 시도하세요. 로컬 서버는 설치한 PC에서만 접근할 수 있습니다.</p>}
      </section>

      <section aria-labelledby="start-title" className="space-y-4">
        <h2 id="start-title" className="font-medium">처음 사용하는 방법</h2>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-6">
          <li><span className="font-medium">앱 설치 후 서버 연결</span><p className="text-muted-foreground">Windows 앱을 설치하고 위 연결 버튼을 누르세요. 직접 설정할 때는 앱의 Server settings에 위 주소를 입력합니다.</p></li>
          <li><span className="font-medium">계정과 문서 폴더 준비</span><p className="text-muted-foreground">Baalda 계정을 만들고 문서를 보관할 폴더를 선택하세요. 인트라넷 계정과 Baalda 계정은 별도입니다.</p></li>
          <li><span className="font-medium">팀원 초대와 공동 편집</span><p className="text-muted-foreground">Vault에서 팀원을 초대하고 필요한 폴더에 보기 또는 편집 권한을 주세요. AI 연결은 Vault settings의 MCP에서 설정합니다.</p></li>
        </ol>
      </section>
      <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">현재 구성은 이 PC의 로컬 검증용입니다. 다른 PC와 공유하려면 접근 가능한 사내 HTTPS 서버 주소로 전환해야 합니다.</p>
    </div>
  );
}
