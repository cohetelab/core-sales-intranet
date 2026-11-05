"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, ExternalLinkIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";

import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreatorPicks } from "@/lib/creator-pick-store";
import { useInfluencerGroupStore } from "@/lib/influencer-group-store";
import { useInfluencerStore } from "@/lib/influencer-store";

const ALL_SELECTED = "__selected__";

export function SampleListPublisher({ initialGroupId }: { initialGroupId: string | null }) {
  const router = useRouter();
  const { influencers } = useInfluencerStore();
  const { picks } = useCreatorPicks();
  const { groups, createGroup, removeMember } = useInfluencerGroupStore();
  const [groupId, setGroupId] = React.useState<string | null>(initialGroupId);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [product, setProduct] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [confirmedSignature, setConfirmedSignature] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");
  const [error, setError] = React.useState("");

  const group = groups.find((item) => item.id === groupId);
  const creators = influencers.filter((creator) => !creator.optOut && (
    group ? group.memberIds.includes(creator.id) : picks[creator.id] === "selected"
  ));
  const effectiveTitle = title.trim() || group?.name || "샘플 리스트";
  const signature = JSON.stringify({
    source: group?.id ?? ALL_SELECTED,
    ids: creators.map((creator) => creator.id).sort(),
    title: effectiveTitle,
    brand: brand.trim(),
    product: product.trim(),
    message: message.trim(),
  });
  const confirmed = confirmedSignature === signature;

  function createSampleGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim()) return;
    const created = createGroup(newName.trim(), newDescription.trim());
    setGroupId(created.id);
    setTitle("");
    setConfirmedSignature("");
    setShareUrl("");
    setNewName("");
    setNewDescription("");
    setCreateOpen(false);
    router.push(`/creator-search?group=${encodeURIComponent(created.id)}`);
  }

  async function publish() {
    if (!confirmed || creators.length < 1 || creators.length > 50) return;
    setPublishing(true);
    setError("");
    setShareUrl("");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: group?.id ?? "creator-search-selected",
          campaignName: effectiveTitle,
          brand: brand.trim(),
          product: product.trim(),
          goal: "",
          message: message.trim(),
          creators: creators.map((creator) => ({
            handle: creator.handle,
            platform: creator.platform,
            profileImageUrl: creator.profileImageUrl ?? "",
            followers: creator.followers,
            engagementRate: creator.engagementRate,
            avgViews: creator.avgViews,
            category: creator.category,
            bio: creator.bio,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 401
        ? "전달 링크 관리에서 관리자 로그인 후 다시 발행해 주세요."
        : result.error ?? "링크 발행에 실패했습니다.");
      const url = `${window.location.origin}/share/${result.share.id}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* URL을 화면에도 표시 */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "링크 발행에 실패했습니다.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-12">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createSampleGroup}>
            <DialogHeader>
              <DialogTitle>새 샘플 리스트 만들기</DialogTitle>
              <DialogDescription>그룹을 만든 뒤 탐색에서 크리에이터를 담습니다.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5"><Label htmlFor="sample-group-name">리스트 이름 *</Label><Input id="sample-group-name" required maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="예: 뮤즈바이 10월 크리에이터" /></div>
              <div className="space-y-1.5"><Label htmlFor="sample-group-description">설명</Label><Input id="sample-group-description" maxLength={200} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="캠페인이나 전달 목적" /></div>
            </div>
            <DialogFooter className="mt-4"><Button type="submit">만들고 탐색으로</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">샘플 리스트 전달</h1>
          <p className="mt-1 text-sm text-muted-foreground">탐색에서 선택한 크리에이터나 그룹을 확정하고 전달용 페이지를 발행합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href={group ? `/creator-search?group=${encodeURIComponent(group.id)}` : "/creator-search?tab=selected"}>탐색에서 명단 편집</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/share-admin">전달 링크 관리</Link></Button>
        </div>
      </div>

      <Card className="shadow-xs"><CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">샘플 리스트 그룹</h2><p className="text-xs text-muted-foreground">일반 그룹처럼 명단을 만들고 탐색에서 후보를 담으세요.</p></div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><PlusIcon className="size-4" /> 새 샘플 리스트</Button>
        </div>
        {groups.some((item) => !item.archivedAt) ? <div className="flex flex-wrap gap-2">
          {groups.filter((item) => !item.archivedAt).map((item) => <button key={item.id} type="button" onClick={() => { setGroupId(item.id); setTitle(""); setConfirmedSignature(""); setShareUrl(""); }} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${group?.id === item.id ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"}`}>
            <span className="font-medium">{item.name}</span><span className="ml-2 text-xs text-muted-foreground">{item.memberIds.length}명</span>
          </button>)}
        </div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">아직 만든 리스트가 없습니다. 새 샘플 리스트를 만들어 시작하세요.</p>}
        {group && <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="mr-auto text-sm"><strong>{group.name}</strong> · {creators.length}명 담김</span>
          <Button asChild size="sm" variant="outline"><Link href={`/creator-search?group=${encodeURIComponent(group.id)}`}><SearchIcon className="size-4" /> 탐색에서 담기</Link></Button>
        </div>}
      </CardContent></Card>

      <Card className="shadow-xs"><CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="sample-source">전달할 명단</Label>
          <Select value={group?.id ?? ALL_SELECTED} onValueChange={(value) => { setGroupId(value === ALL_SELECTED ? null : value); setShareUrl(""); setError(""); }}>
            <SelectTrigger id="sample-source" className="w-full sm:w-80"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SELECTED}>탐색에서 선택한 크리에이터</SelectItem>
              {groups.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.archivedAt ? " (보관됨)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{creators.length}명 · 선택과 그룹은 현재 브라우저에 저장된 명단을 사용합니다.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="sample-title">리스트 제목</Label><Input id="sample-title" maxLength={160} placeholder={group?.name ?? "샘플 리스트"} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sample-brand">브랜드명</Label><Input id="sample-brand" maxLength={120} placeholder="브랜드명 (선택)" value={brand} onChange={(event) => setBrand(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sample-product">제품명</Label><Input id="sample-product" maxLength={160} placeholder="제품명 (선택)" value={product} onChange={(event) => setProduct(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sample-message">전달 메시지</Label><Textarea id="sample-message" maxLength={500} rows={2} placeholder="전달 메시지 (선택)" value={message} onChange={(event) => setMessage(event.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" disabled={creators.length === 0 || creators.length > 50} onClick={() => { setConfirmedSignature(signature); setShareUrl(""); setError(""); }}><CheckIcon className="size-4" /> 명단 확정</Button>
          <Button disabled={!confirmed || publishing} onClick={publish}><CopyIcon className="size-4" /> {publishing ? "발행 중…" : "전달용 링크 발행"}</Button>
          <span className="text-xs text-muted-foreground">{creators.length > 50 ? "한 링크에는 최대 50명까지 담을 수 있습니다." : confirmed ? "현재 명단 확정됨" : "명단과 내용을 확정해 주세요."}</span>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error} <Link href="/share-admin" target="_blank" className="underline">관리자 로그인</Link></p>}
        {shareUrl && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-medium">전달 링크를 발행하고 URL을 복사했습니다.</p><a href={shareUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all underline">{shareUrl}<ExternalLinkIcon className="size-3.5 shrink-0" /></a></div>}
      </CardContent></Card>

      <Card className="shadow-xs"><CardContent>
        <div className="mb-3 flex items-center gap-2"><UsersIcon className="size-4" /><h2 className="font-semibold">전달 명단 미리보기</h2><span className="text-sm text-muted-foreground">{creators.length}명</span></div>
        {creators.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">명단이 비어 있습니다. 탐색에서 크리에이터를 선택하거나 그룹에 추가해 주세요.</p> : (
          <div className="divide-y">{creators.map((creator) => <div key={creator.id} className="flex items-center gap-3 py-3">
            <InfluencerAvatar influencer={creator} className="size-9" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">@{creator.handle}</p><p className="text-xs text-muted-foreground">{creator.platform === "instagram" ? "Instagram" : "TikTok"} · {creator.category.join(", ") || "카테고리 없음"}</p></div>
            <span className="text-xs text-muted-foreground tabular-nums">팔로워 {creator.followers.toLocaleString("ko-KR")}</span>
            {group && <Button type="button" variant="ghost" size="icon-sm" aria-label={`${creator.handle} 명단에서 제거`} onClick={() => removeMember(group.id, creator.id)}><XIcon className="size-4" /></Button>}
          </div>)}</div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">발행된 페이지는 그 시점의 확정본입니다. 이후 명단을 수정해도 기존 페이지는 바뀌지 않습니다.</p>
      </CardContent></Card>
    </div>
  );
}
