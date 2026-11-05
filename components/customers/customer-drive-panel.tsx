"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Folder, LogOut, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DriveItem = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };
type DriveListing = { path: { id: string; name: string }[]; files: DriveItem[]; nextPageToken: string | null };
type DriveStatus = { configured: boolean; connected: boolean; email?: string | null };

const FOLDER_MIME = "application/vnd.google-apps.folder";

function itemIcon(mime: string) {
  if (mime === FOLDER_MIME) return <Folder className="size-5 text-amber-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return <FileSpreadsheet className="size-5 text-emerald-600" />;
  if (mime.includes("document") || mime.includes("pdf") || mime.includes("word")) return <FileText className="size-5 text-blue-600" />;
  return <File className="size-5 text-muted-foreground" />;
}

function errorMessage(value: string) {
  if (value === "forbidden") return "이 폴더에 접근할 권한이 없거나 지정된 고객사 폴더 밖에 있습니다.";
  if (value === "connect") return "Google 연결이 만료되었습니다. 다시 연결해 주세요.";
  if (value === "scope") return "Drive 목록 권한이 허용되지 않았습니다. 다시 연결해 주세요.";
  if (value === "storage") return "연결 정보를 저장하지 못했습니다. 관리자에게 저장소 설정을 확인해 달라고 요청해 주세요.";
  if (value === "oauth") return "Google 연결을 완료하지 못했습니다. 다시 시도해 주세요.";
  return "폴더 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function CustomerDrivePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folder = searchParams.get("folder") ?? "";
  const query = searchParams.get("q") ?? "";
  const callbackError = searchParams.get("error") ?? "";
  const [draft, setDraft] = React.useState(query);
  const [status, setStatus] = React.useState<DriveStatus | null>(null);
  const [listing, setListing] = React.useState<DriveListing | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pageToken, setPageToken] = React.useState("");
  const [previousTokens, setPreviousTokens] = React.useState<string[]>([]);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    fetch("/api/google-drive/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: DriveStatus) => { if (active) setStatus(value); })
      .catch(() => { if (active) setError("상태를 확인하지 못했습니다."); });
    return () => { active = false; };
  }, [revision]);

  React.useEffect(() => {
    if (!status?.configured || !status.connected) return;
    let active = true;
    const params = new URLSearchParams();
    if (folder) params.set("folder", folder);
    if (query) params.set("q", query);
    if (pageToken) params.set("pageToken", pageToken);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    fetch(`/api/google-drive/files?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? "upstream");
        return value as DriveListing;
      })
      .then((value) => { if (active) setListing(value); })
      .catch((cause) => { if (active) { const code = cause instanceof Error ? cause.message : "upstream"; setListing(null); setError(errorMessage(code)); if (code === "connect") setStatus({ configured: true, connected: false }); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status?.configured, status?.connected, folder, query, pageToken, revision]);

  function navigate(nextFolder: string, nextQuery = "") {
    setPageToken("");
    setPreviousTokens([]);
    setDraft(nextQuery);
    const params = new URLSearchParams();
    if (nextFolder) params.set("folder", nextFolder);
    if (nextQuery) params.set("q", nextQuery);
    router.push(`/customers/drive${params.size ? `?${params}` : ""}`);
  }

  async function disconnect() {
    const response = await fetch("/api/google-drive/disconnect", { method: "POST" });
    if (!response.ok) { setError("연결을 해제하지 못했습니다."); return; }
    setStatus({ configured: true, connected: false });
    setListing(null);
    navigate("");
  }

  const visibleFiles = listing?.files ?? [];
  return <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">고객사 · 구글 드라이브로 보기</h1><p className="mt-1 text-sm text-muted-foreground">고객사 상위 폴더를 읽기 전용으로 탐색합니다. 파일은 Google Drive에서 열립니다.</p></div>
      <Button asChild variant="outline" size="sm"><Link href="/customers">고객사 목록</Link></Button>
    </div>

    {callbackError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage(callbackError)}</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

    {status === null ? <Card><CardContent className="text-sm text-muted-foreground">연결 상태 확인 중…</CardContent></Card>
      : !status.configured ? <Card><CardContent className="space-y-2"><h2 className="font-semibold">Google Drive 연결 설정이 필요합니다</h2><p className="text-sm text-muted-foreground">관리자가 Google OAuth, 고객사 상위 폴더 ID, 서버 저장소를 설정하면 이곳에서 각자 Google 계정을 연결할 수 있습니다.</p></CardContent></Card>
      : !status.connected ? <Card><CardContent className="space-y-4"><div><h2 className="font-semibold">내 Google 계정 연결</h2><p className="mt-1 text-sm text-muted-foreground">연결한 계정에 열람 권한이 있는 고객사 폴더만 표시됩니다.</p></div><Button asChild><a href="/api/google-drive/connect">Google Drive 연결하기</a></Button></CardContent></Card>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">연결된 계정: <strong className="text-foreground">{status.email}</strong></span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4" /> 새로고침</Button><Button variant="outline" size="sm" onClick={disconnect}><LogOut className="size-4" /> 연결 해제</Button></div></div>
        <Card><CardContent className="space-y-4">
          <nav aria-label="Google Drive 폴더 경로" className="flex flex-wrap items-center gap-1 text-sm">
            {listing?.path.map((part, index) => <React.Fragment key={part.id}>{index > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}<button type="button" onClick={() => navigate(index === 0 ? "" : part.id)} className={index === listing.path.length - 1 ? "font-semibold" : "text-primary hover:underline"}>{part.name}</button></React.Fragment>)}
          </nav>
          <form onSubmit={(event) => { event.preventDefault(); navigate(folder, draft.trim()); }} className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="현재 폴더에서 이름 검색" className="pl-9" /></div><Button type="submit" variant="secondary">검색</Button>{query && <Button type="button" variant="ghost" onClick={() => navigate(folder)}>초기화</Button>}</form>
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">폴더를 불러오는 중…</p> : visibleFiles.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{query ? "검색 결과가 없습니다." : "이 폴더는 비어 있습니다."}</p> : <div className="divide-y rounded-xl border">
            {visibleFiles.map((item) => <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {itemIcon(item.mimeType)}
              {item.mimeType === FOLDER_MIME ? <button type="button" onClick={() => navigate(item.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{item.name}</button> : <span className="min-w-0 flex-1 truncate">{item.name}</span>}
              {item.modifiedTime && <time className="hidden shrink-0 text-xs text-muted-foreground sm:block" dateTime={item.modifiedTime}>{new Date(item.modifiedTime).toLocaleDateString("ko-KR")}</time>}
              <a href={item.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} Google Drive에서 열기`} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-4" /></a>
            </div>)}
          </div>}
          {(previousTokens.length > 0 || listing?.nextPageToken) && <div className="flex items-center justify-end gap-2 text-sm"><span className="mr-auto text-muted-foreground">{previousTokens.length + 1}페이지</span><Button variant="outline" size="sm" disabled={previousTokens.length === 0 || loading} onClick={() => { const history = [...previousTokens]; setPageToken(history.pop() ?? ""); setPreviousTokens(history); }}>이전</Button><Button variant="outline" size="sm" disabled={!listing?.nextPageToken || loading} onClick={() => { setPreviousTokens((tokens) => [...tokens, pageToken]); setPageToken(listing!.nextPageToken!); }}>다음</Button></div>}
        </CardContent></Card>
      </>}
  </div>;
}
