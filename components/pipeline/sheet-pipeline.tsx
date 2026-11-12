"use client";

import * as React from "react";
import { GripVerticalIcon, RefreshCw, SearchIcon } from "lucide-react";

import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet";
import type { SheetLeads } from "@/components/sheet-leads-provider";
import { StatGrid, type Stat } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatKRW, formatKst } from "@/lib/format";
import { contractAmountOf } from "@/lib/lead-fields";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/mock-data";
import { OWNER_OPTIONS, UNASSIGNED } from "@/lib/sales-reps";
import type { Customer, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";

// 구글 시트가 원본인 파이프라인. 카드는 시트의 문의(고객 단위)이고, 드래그하면 시트의 '단계' 칸에 기록된다.
// 시트에는 월 금액이 없어서 금액 대신 건수와 계약 금액 합계를 보여 준다.

const PAGE = 30; // 열마다 처음 보여 줄 카드 수(리드가 수백 건이라 전부 그리지 않는다)
const FAILED_TAG = "실패/종료";

const STAGE_DOT: Record<DealStage, string> = {
  lead: "bg-muted-foreground",
  discovery: "bg-blue-500",
  proposal: "bg-amber-500",
  won: "bg-emerald-500",
};

const ownerLabel = (owner: string) => owner.match(/\(([^)]+)\)/)?.[1] ?? owner.slice(0, 2);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-2xl px-3 text-xs ring-1 ring-foreground/10 transition-colors",
        active ? "bg-primary text-primary-foreground ring-primary" : "hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function DealCard({
  c,
  saving,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  c: Customer;
  saving: boolean;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const amount = c.stage === "won" ? contractAmountOf(c.tags) : 0;
  const recontact = c.tags.find((t) => t.startsWith("재문의"));
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(c.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(c.id)}
      role="button"
      tabIndex={0}
      aria-label={`${c.company} 카드`}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(c.id);
      }}
      className={cn(
        "group cursor-grab rounded-lg border-l-2 bg-card p-3 transition-colors active:cursor-grabbing",
        c.stage === "won"
          ? "border border-l-lime-400 bg-lime-300/20 hover:bg-lime-300/30 dark:bg-lime-400/10 dark:hover:bg-lime-400/15"
          : "border border-l-transparent hover:bg-accent/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{c.company}</p>
        <div className="flex shrink-0 items-center gap-1">
          {saving && (
            <span role="status" className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" /> 저장 중
            </span>
          )}
          <Badge variant="outline" className="text-[10px]">
            {c.category.split("·")[0].trim()}
          </Badge>
          <GripVerticalIcon className="size-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{c.phone || "-"}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums">{formatKst(c.createdAt)}</p>
      {(recontact || amount > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {recontact && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
              {recontact}
            </Badge>
          )}
          {amount > 0 && <span className="text-xs font-semibold tabular-nums">{formatKRW(amount)}</span>}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.nextStep ? `→ ${c.nextStep}` : ""}</p>
        <span
          className={cn(
            "flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-[10px] font-medium",
            c.owner === UNASSIGNED ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
          )}
        >
          {c.owner === UNASSIGNED ? "미배정" : ownerLabel(c.owner)}
        </span>
      </div>
    </div>
  );
}

function Column({
  stage,
  items,
  limit,
  onMore,
  savingIds,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropCustomer,
}: {
  stage: DealStage;
  items: Customer[];
  limit: number;
  onMore: () => void;
  savingIds: ReadonlySet<string>;
  draggingId: string | null;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropCustomer: (id: string, stage: DealStage) => void;
}) {
  const [isOver, setIsOver] = React.useState(false);
  const draggingIntoOtherStage = draggingId != null && !items.some((i) => i.id === draggingId);
  const shown = items.slice(0, limit);
  const contractTotal = stage === "won" ? items.reduce((s, c) => s + contractAmountOf(c.tags), 0) : 0;

  return (
    <Card
      className={cn("min-w-[18rem] flex-1 snap-start shadow-xs transition-colors", isOver && draggingIntoOtherStage && "ring-2 ring-primary/50")}
      data-stage={stage}
      onDragOver={(e) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropCustomer(id, stage);
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className={`size-2 rounded-full ${STAGE_DOT[stage]}`} />
          {STAGE_LABEL[stage]}
        </CardTitle>
        <CardAction className="flex items-center gap-1.5">
          <Badge variant="secondary" className="font-normal" aria-label={`${STAGE_LABEL[stage]} ${items.length}건`}>
            {items.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          {stage === "won" ? `계약 금액 합계 ${formatKRW(contractTotal)}` : items.length > limit ? `최근 ${limit}건 표시 · 전체 ${items.length}건` : `${items.length}건`}
        </p>
        <div className="min-h-16 space-y-2">
          {items.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{isOver && draggingIntoOtherStage ? "여기로 이동" : "없음"}</p>
          ) : (
            shown.map((c) => <DealCard key={c.id} c={c} saving={savingIds.has(c.id)} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />)
          )}
          {items.length > limit && (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onMore}>
              더 보기 (+{Math.min(PAGE, items.length - limit)})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SheetPipeline({ sheet }: { sheet: SheetLeads }) {
  const [query, setQuery] = React.useState("");
  const [owner, setOwner] = React.useState("all");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [blockNote, setBlockNote] = React.useState<string | null>(null);
  const [limits, setLimits] = React.useState<Record<DealStage, number>>({ lead: PAGE, discovery: PAGE, proposal: PAGE, won: PAGE });

  // 실패/종료 고객은 파이프라인에서 숨긴다(리드 인박스에서 태그로 볼 수 있다).
  const active = React.useMemo(() => sheet.customers.filter((c) => !c.tags.includes(FAILED_TAG)), [sheet.customers]);
  const failedCount = sheet.customers.length - active.length;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return active.filter((c) => {
      if (owner !== "all" && c.owner !== owner) return false;
      if (!q) return true;
      return (
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qd.length >= 3 && c.phone.replace(/\D/g, "").includes(qd))
      );
    });
  }, [active, owner, query]);

  const byStage = React.useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        items: filtered.filter((c) => c.stage === stage).sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)),
      })),
    [filtered]
  );
  const count = (stage: DealStage) => byStage.find((b) => b.stage === stage)?.items.length ?? 0;
  const won = byStage.find((b) => b.stage === "won")?.items ?? [];
  const contractSum = won.reduce((s, c) => s + contractAmountOf(c.tags), 0);
  const recorded = won.filter((c) => contractAmountOf(c.tags) > 0).length;
  const open = count("lead") + count("discovery") + count("proposal");

  const stats: Stat[] = [
    { label: "진행 중 딜", value: `${open.toLocaleString("ko-KR")}건`, footerTitle: `리드 ${count("lead")} · 상담 ${count("discovery")} · 제안 ${count("proposal")}` },
    { label: "제안 단계", value: `${count("proposal").toLocaleString("ko-KR")}건`, badge: count("proposal") > 0 ? { text: "클로징 임박", tone: "warning" } : undefined },
    { label: "계약 금액 합계", value: formatKRW(contractSum), footerTitle: `계약 ${won.length}건 중 금액 기재 ${recorded}건` },
  ];

  const ownerCount = (o: string) => active.filter((c) => (o === "all" ? true : c.owner === o)).length;
  const detail = detailId ? (sheet.customers.find((c) => c.id === detailId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mt-1 text-sm text-muted-foreground">
          리드 → 상담 → 제안 → 계약 · 카드를 드래그해서 단계를 옮기면 시트의 &lsquo;단계&rsquo; 칸에 기록됩니다
        </p>
        <Button variant="outline" className="h-9 py-2" disabled={sheet.refreshing} onClick={() => void sheet.refresh()}>
          <RefreshCw className={`size-3.5 ${sheet.refreshing ? "animate-spin" : ""}`} /> 새로고침
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          구글 시트 연동 · 시트가 원본입니다
        </span>
        {sheet.fetchedAt && <span>· 마지막 확인 {formatDateTime(sheet.fetchedAt)}</span>}
        <span>· 30초마다 새로 확인</span>
        {sheet.user && <span>· {sheet.user}</span>}
        {sheet.savingIds.size > 0 ? (
          <span role="status" className="font-medium text-foreground">· 시트에 저장하는 중…</span>
        ) : sheet.savedAt ? (
          <span role="status" className="font-medium text-emerald-700">· ✓ 시트에 저장했습니다 ({formatKst(sheet.savedAt)})</span>
        ) : null}
        {failedCount > 0 && <span>· 실패/종료 {failedCount}건은 숨김(리드 인박스에서 태그로 확인)</span>}
      </div>

      {sheet.notice && (
        <div
          role="alert"
          className={cn(
            "flex items-start justify-between gap-3 rounded-2xl px-3 py-2 text-xs",
            sheet.notice.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
          )}
        >
          <span>{sheet.notice.text}</span>
          <button type="button" onClick={sheet.dismissNotice} className="shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      {blockNote && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl bg-muted px-3 py-2 text-xs text-foreground">
          <span>{blockNote}</span>
          <button type="button" onClick={() => setBlockNote(null)} className="shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      <StatGrid stats={stats} className="grid-cols-1 @xl/main:grid-cols-3" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상호·연락처·이메일 검색"
            aria-label="딜 검색"
            className="h-8 w-60 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="담당 필터">
          {(["all", ...OWNER_OPTIONS] as string[]).map((o) => (
            <Chip key={o} active={owner === o} onClick={() => setOwner(o)}>
              {o === "all" ? "전체 담당" : o}
              <span className="tabular-nums opacity-70">{ownerCount(o).toLocaleString("ko-KR")}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div className="-mx-4 flex snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-3 lg:-mx-6 lg:px-6" role="region" aria-label="파이프라인 칸반" tabIndex={0}>
        {byStage.map(({ stage, items }) => (
          <Column
            key={stage}
            stage={stage}
            items={items}
            limit={limits[stage]}
            onMore={() => setLimits((l) => ({ ...l, [stage]: l[stage] + PAGE }))}
            savingIds={sheet.savingIds}
            draggingId={draggingId}
            onOpen={setDetailId}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onDropCustomer={(id, target) => {
              setDraggingId(null);
              const card = sheet.customers.find((c) => c.id === id);
              if (!card || card.stage === target) return;
              // 계약 금액이 적혀 있으면 단계 칸을 비워도(리드로 되돌려도) 계속 계약으로 읽힌다. 시트의 금액을 지우는 건 여기서 하지 않는다.
              if (target === "lead" && contractAmountOf(card.tags) > 0) {
                setBlockNote(`${card.company}은(는) 시트에 계약 금액이 적혀 있어 리드로 되돌릴 수 없습니다. 되돌리려면 시트의 '계약 금액'을 먼저 비워 주세요.`);
                return;
              }
              setBlockNote(null);
              void sheet.moveStage(id, target);
            }}
          />
        ))}
      </div>

      <LeadDetailSheet
        customer={detail}
        row={detailId ? sheet.meta[detailId]?.row : undefined}
        sheetUrl={sheet.sheetUrl}
        gid={sheet.gid}
        raw={detailId ? sheet.meta[detailId]?.raw : undefined}
        user={sheet.user}
        onRecord={sheet.record}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
