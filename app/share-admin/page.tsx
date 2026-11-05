"use client";

import * as React from "react";
import Link from "next/link";
import { CopyIcon, ExternalLinkIcon, LockKeyholeIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShareSnapshot } from "@/lib/share-snapshots";

export default function ShareAdminPage() {
  const [authenticated, setAuthenticated] = React.useState<boolean | null>(null);
  const [configured, setConfigured] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [shares, setShares] = React.useState<ShareSnapshot[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState("");

  const loadShares = React.useCallback(async () => {
    const response = await fetch("/api/shares", { cache: "no-store" });
    if (!response.ok) throw new Error("발행 목록을 불러오지 못했습니다.");
    const result = await response.json();
    setShares(result.shares);
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/share-admin", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (result) => {
        if (!active) return;
        setAuthenticated(result.authenticated);
        setConfigured(result.configured);
        if (result.authenticated) await loadShares();
      })
      .catch(() => { if (active) setError("관리자 상태를 확인하지 못했습니다."); });
    return () => { active = false; };
  }, [loadShares]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/share-admin", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "로그인하지 못했습니다.");
      setPassword("");
      setAuthenticated(true);
      await loadShares();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/share-admin", { method: "DELETE" });
    setAuthenticated(false);
    setShares([]);
  }

  async function revoke(id: string) {
    if (!window.confirm("이 전달 링크를 철회할까요? 받는 사람이 더 이상 페이지를 볼 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("링크를 철회하지 못했습니다.");
      setShares((current) => current.filter((share) => share.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "링크를 철회하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${id}`);
      setCopiedId(id);
    } catch {
      setError("주소를 복사하지 못했습니다. 페이지를 열어 주소창에서 복사해 주세요.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">전달 링크 관리</h1><p className="mt-1 text-sm text-muted-foreground">확정한 크리에이터 명단의 URL을 복사하거나 철회합니다.</p></div>
        {authenticated && <Button variant="outline" size="sm" onClick={logout}>관리자 로그아웃</Button>}
      </div>
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      {authenticated === null ? <p className="text-sm text-muted-foreground">관리자 상태 확인 중…</p> : !configured ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">서버 저장소와 관리자 암호 설정이 필요합니다.</CardContent></Card>
      ) : !authenticated ? (
        <Card className="max-w-md"><CardContent className="space-y-4 py-6">
          <div className="flex items-center gap-2 font-semibold"><LockKeyholeIcon className="size-4" /> 관리자 로그인</div>
          <form onSubmit={login} className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="share-admin-password">관리자 암호</Label><Input id="share-admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            <Button type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</Button>
          </form>
        </CardContent></Card>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/40 p-4 text-sm"><p className="font-medium">새 링크 발행</p><p className="mt-1 text-muted-foreground">크리에이터 → 샘플 리스트 전달에서 명단을 확정하고 전달용 링크를 발행하세요.</p><Button asChild variant="outline" size="sm" className="mt-3"><Link href="/sample-lists">샘플 리스트 전달로</Link></Button></div>
          {shares.length === 0 ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">발행한 전달 링크가 없습니다.</CardContent></Card> : (
            <div className="space-y-3">{shares.map((share) => <Card key={share.id} className="py-0"><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div><p className="font-semibold">{share.campaignName}</p><p className="mt-1 text-xs text-muted-foreground">{share.brand} · {share.creators.length}명 · {new Date(share.createdAt).toLocaleString("ko-KR")}</p><p className="mt-1 break-all text-xs text-muted-foreground">{typeof window !== "undefined" ? `${window.location.origin}/share/${share.id}` : `/share/${share.id}`}</p></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(share.id)}><CopyIcon className="size-3.5" /> {copiedId === share.id ? "복사됨" : "URL 복사"}</Button><Button asChild variant="outline" size="sm"><Link href={`/share/${share.id}`} target="_blank"><ExternalLinkIcon className="size-3.5" /> 미리보기</Link></Button><Button variant="outline" size="sm" disabled={busy} onClick={() => revoke(share.id)}><Trash2Icon className="size-3.5" /> 철회</Button></div>
            </CardContent></Card>)}</div>
          )}
          <p className="text-xs text-muted-foreground">발행된 목록은 당시의 확정본입니다. 명단을 바꾸려면 새 링크를 발행하고 이전 링크를 철회하세요.</p>
        </>
      )}
    </div>
  );
}
