"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRightIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCampaigns } from "@/lib/campaign-store";
import { useCreatorSettlements } from "@/lib/creator-settlement-store";
import { useInfluencerStore } from "@/lib/influencer-store";
import { defaultProduction, isOverdue, PRODUCTION_STAGES, PRODUCTION_STAGE_LABEL, type ProductionStage, type VideoProduction } from "@/lib/video-production";

type ProductionRow = {
  id: string;
  source: "campaign" | "manual";
  campaignId?: string;
  creatorId?: string;
  creatorName: string;
  campaignName: string;
  resultUrl: string;
  views: number;
  production: VideoProduction;
};

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export default function ProductionPage() {
  const { campaigns, hydrated: campaignsReady, updateCreator } = useCampaigns();
  const { records, hydrated: recordsReady, update } = useCreatorSettlements();
  const { influencers } = useInfluencerStore();
  const [filter, setFilter] = React.useState<ProductionStage | "all" | "overdue">("all");
  const [query, setQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const ready = campaignsReady && recordsReady;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const handles = new Map(influencers.map((creator) => [creator.id, creator.handle]));

  const campaignRows: ProductionRow[] = campaigns.flatMap((campaign) => campaign.creators.map((creator) => ({
    id: `campaign:${campaign.id}:${creator.influencerId}`,
    source: "campaign" as const,
    campaignId: campaign.id,
    creatorId: creator.influencerId,
    creatorName: handles.get(creator.influencerId) ?? creator.influencerId,
    campaignName: campaign.name,
    resultUrl: creator.uploadUrl,
    views: creator.views,
    production: creator.production ?? defaultProduction(creator.uploadUrl, creator.views > 0),
  })));
  const manualRows: ProductionRow[] = records.map((record) => ({
    id: `manual:${record.id}`,
    source: "manual",
    creatorName: record.creatorName,
    campaignName: record.campaignName,
    resultUrl: record.resultUrl,
    views: record.metrics?.views ?? 0,
    production: record.production ?? defaultProduction(record.resultUrl, (record.metrics?.views ?? 0) > 0),
  }));
  const rows = [...campaignRows, ...manualRows];
  const needle = query.trim().toLocaleLowerCase();
  const visible = rows.filter((row) => {
    if (filter === "overdue" && !isOverdue(row.production, today)) return false;
    if (filter !== "all" && filter !== "overdue" && row.production.stage !== filter) return false;
    return !needle || [row.creatorName, row.campaignName, row.production.assignee].some((value) => value.toLocaleLowerCase().includes(needle));
  });
  const overdueCount = rows.filter((row) => isOverdue(row.production, today)).length;
  const awaitingReview = rows.filter((row) => row.production.stage === "review").length;
  const publishedCount = rows.filter((row) => ["published", "metrics"].includes(row.production.stage)).length;
  const editing = rows.find((row) => row.id === editingId);

  const save = (row: ProductionRow, production: VideoProduction, resultUrl: string) => {
    if (row.source === "campaign" && row.campaignId && row.creatorId) {
      updateCreator(row.campaignId, row.creatorId, { production, uploadUrl: resultUrl });
    } else if (row.source === "manual") {
      update(row.id.slice("manual:".length), { production, resultUrl });
    }
    setEditingId(null);
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">숏폼 제작 파이프라인</h1>
        <p className="mt-1 text-sm text-muted-foreground">영상별 담당자와 마감, 검수·게시 상태를 관리합니다.</p>
      </div>
      <Button asChild variant="outline"><Link href="/pms">콘텐츠 성과 <ArrowUpRightIcon className="size-4" /></Link></Button>
    </div>

    <Card className="border-primary/15 bg-primary/5 shadow-xs">
      <CardContent className="text-xs leading-relaxed text-muted-foreground">
        캠페인 크리에이터와 직접 등록한 정산 건이 표시됩니다. 상태·담당자·마감은 이 브라우저에 저장됩니다. 게시 URL을 기록하면 콘텐츠 성과 화면에 연결되며, 정산 상태와 기존 캠페인 업무 단계는 자동으로 바꾸지 않습니다.
      </CardContent>
    </Card>

    <div className="grid gap-3 sm:grid-cols-3">
      <Summary label="진행 중" value={rows.length - publishedCount} detail="게시 전 영상" />
      <Summary label="고객사 검수" value={awaitingReview} detail="승인 확인 필요" />
      <Summary label="마감 초과" value={overdueCount} detail="미게시·마감일 경과" alert={overdueCount > 0} />
    </div>

    <Card className="py-0 shadow-xs">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b py-4">
        <div><CardTitle>제작 목록</CardTitle><p className="mt-1 text-xs text-muted-foreground">{ready ? `${visible.length}건 표시 · 전체 ${rows.length}건` : "불러오는 중"}</p></div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="영상 검색" placeholder="크리에이터·캠페인·담당자 검색" value={query} onChange={(event) => setQuery(event.target.value)} className="w-56" />
          <select aria-label="제작 단계 필터" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="all">모든 단계</option><option value="overdue">마감 초과</option>
            {PRODUCTION_STAGES.map((stage) => <option key={stage} value={stage}>{PRODUCTION_STAGE_LABEL[stage]}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!ready ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">제작 목록을 불러오는 중입니다.</p> : visible.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted-foreground"><p>{rows.length ? "조건에 맞는 영상이 없습니다." : "등록된 캠페인 크리에이터나 정산 건이 없습니다."}</p>{!rows.length && <Link className="mt-2 inline-block text-primary hover:underline" href="/creator-settlements/new">정산 건 등록하기</Link>}</div> : <div className="divide-y">
          {visible.map((row) => {
            const overdue = isOverdue(row.production, today);
            const url = validUrl(row.resultUrl);
            return <div key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0"><p className="truncate text-sm font-medium">@{row.creatorName.replace(/^@/, "")}</p><p className="truncate text-xs text-muted-foreground">{row.campaignName || "캠페인 미입력"}</p></div>
              <div className="flex flex-wrap items-center gap-2"><Badge variant={row.production.stage === "metrics" ? "secondary" : "outline"}>{PRODUCTION_STAGE_LABEL[row.production.stage]}</Badge>{overdue && <Badge variant="destructive">마감 초과</Badge>}<span className="text-xs text-muted-foreground">수정 {row.production.revisionCount}회</span></div>
              <div className="text-xs"><p>{row.production.assignee || "담당자 미지정"}</p><p className="mt-1 text-muted-foreground">마감 {row.production.dueDate || "미입력"}{row.production.approvedAt ? ` · 승인 ${row.production.approvedAt}` : ""}</p></div>
              <div className="flex items-center gap-2 lg:justify-end">{url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${row.creatorName} 게시물 열기`} className="text-primary hover:underline"><ExternalLinkIcon className="size-4" /></a>}<Button size="sm" variant="outline" onClick={() => setEditingId(editingId === row.id ? null : row.id)}><PencilIcon className="size-3" /> 관리</Button></div>
              {editing?.id === row.id && <ProductionEditor key={row.id} row={row} onSave={(production, resultUrl) => save(row, production, resultUrl)} onCancel={() => setEditingId(null)} />}
            </div>;
          })}
        </div>}
      </CardContent>
    </Card>
  </div>;
}

function Summary({ label, value, detail, alert = false }: { label: string; value: number; detail: string; alert?: boolean }) {
  return <Card className="gap-2 py-4 shadow-xs"><CardContent><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function ProductionEditor({ row, onSave, onCancel }: { row: ProductionRow; onSave: (production: VideoProduction, resultUrl: string) => void; onCancel: () => void }) {
  const [value, setValue] = React.useState(row.production);
  const [resultUrl, setResultUrl] = React.useState(row.resultUrl);
  const [error, setError] = React.useState("");
  const set = <K extends keyof VideoProduction>(key: K, next: VideoProduction[K]) => setValue((current) => ({ ...current, [key]: next }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const url = resultUrl.trim();
    if (url && !validUrl(url)) return setError("게시 URL을 http 또는 https 주소로 입력해 주세요.");
    if (["published", "metrics"].includes(value.stage) && !url) return setError("게시·성과 입력 단계에는 게시 URL이 필요합니다.");
    if (value.stage === "metrics" && row.views === 0) return setError("성과 입력 단계로 옮기려면 콘텐츠 성과 화면에서 조회수를 먼저 입력해 주세요.");
    if (!Number.isSafeInteger(value.revisionCount) || value.revisionCount < 0) return setError("수정 횟수는 0 이상의 정수로 입력해 주세요.");
    if (value.approvedAt && value.stage === "planning") return setError("승인일이 있다면 검수 이후 단계를 선택해 주세요.");
    onSave({ ...value, assignee: value.assignee.trim(), note: value.note.trim(), updatedAt: new Date().toISOString() }, url);
  };
  return <form onSubmit={submit} className="col-span-full grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
    <div className="space-y-1.5"><Label htmlFor={`stage-${row.id}`}>제작 단계</Label><select id={`stage-${row.id}`} value={value.stage} onChange={(event) => set("stage", event.target.value as ProductionStage)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{PRODUCTION_STAGES.map((stage) => <option key={stage} value={stage}>{PRODUCTION_STAGE_LABEL[stage]}</option>)}</select></div>
    <div className="space-y-1.5"><Label htmlFor={`assignee-${row.id}`}>담당자</Label><Input id={`assignee-${row.id}`} value={value.assignee} onChange={(event) => set("assignee", event.target.value)} maxLength={80} placeholder="담당자 이름" /></div>
    <div className="space-y-1.5"><Label htmlFor={`due-${row.id}`}>마감일</Label><Input id={`due-${row.id}`} type="date" value={value.dueDate} onInput={(event) => set("dueDate", event.currentTarget.value)} onChange={(event) => set("dueDate", event.target.value)} /></div>
    <div className="space-y-1.5"><Label htmlFor={`revisions-${row.id}`}>수정 요청 횟수</Label><Input id={`revisions-${row.id}`} type="number" min="0" step="1" value={value.revisionCount} onChange={(event) => set("revisionCount", Number(event.target.value))} /></div>
    <div className="space-y-1.5"><Label htmlFor={`approved-${row.id}`}>고객사 승인일</Label><Input id={`approved-${row.id}`} type="date" value={value.approvedAt} onInput={(event) => set("approvedAt", event.currentTarget.value)} onChange={(event) => set("approvedAt", event.target.value)} /></div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`url-${row.id}`}>게시 URL</Label><Input id={`url-${row.id}`} type="url" value={resultUrl} onChange={(event) => setResultUrl(event.target.value)} placeholder="https://..." /></div>
    <div className="space-y-1.5 sm:col-span-2 lg:col-span-4"><Label htmlFor={`note-${row.id}`}>검수·수정 메모</Label><Input id={`note-${row.id}`} value={value.note} onChange={(event) => set("note", event.target.value)} maxLength={500} placeholder="예: 자막 수정 요청, 최종 승인 대기" /></div>
    {error && <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{error}</p>}
    <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm">저장</Button><Button type="button" size="sm" variant="outline" onClick={onCancel}>취소</Button><Button asChild size="sm" variant="ghost"><Link href="/pms">성과 입력 <ArrowUpRightIcon className="size-3" /></Link></Button></div>
  </form>;
}
