"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRightIcon, ExternalLinkIcon, PlusIcon, SearchIcon, WalletIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatGrid, type Stat } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCampaigns } from "@/lib/campaign-store";
import { useCreatorSettlements, type SettlementStatus } from "@/lib/creator-settlement-store";
import { useInfluencerStore } from "@/lib/influencer-store";
import { engagementRate, type ContentMetrics } from "@/lib/pms-metrics";
import { formatMargin, marginOf, marginRate } from "@/lib/settlement-margin";

type StatusFilter = "all" | SettlementStatus;
type SettlementRow = {
  id: string;
  source: "campaign" | "manual";
  campaignId?: string;
  creatorId?: string;
  creatorName: string;
  campaignName: string;
  resultUrl: string;
  amount: number;
  contractAmount?: number;
  metrics: ContentMetrics;
  status: SettlementStatus;
  bankReconciliationNote: string;
};

const STATUS_OPTIONS: { value: SettlementStatus; label: string }[] = [
  { value: "pending", label: "대기" },
  { value: "processing", label: "정산 중" },
  { value: "completed", label: "완료로 기록" },
];

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

function safeResultUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function CreatorSettlementsPage() {
  const { campaigns, hydrated: campaignsReady, updateCreator } = useCampaigns();
  const { records, hydrated: recordsReady, update } = useCreatorSettlements();
  const { influencers } = useInfluencerStore();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [campaignFilter, setCampaignFilter] = React.useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [editingContractId, setEditingContractId] = React.useState<string | null>(null);
  const [contractDraft, setContractDraft] = React.useState("");
  const [contractError, setContractError] = React.useState("");
  const ready = campaignsReady && recordsReady;

  const handles = new Map(influencers.map((creator) => [creator.id, creator.handle]));
  const campaignRows: SettlementRow[] = campaigns.flatMap((campaign) =>
    campaign.creators.map((creator) => ({
      id: `campaign:${campaign.id}:${creator.influencerId}`,
      source: "campaign" as const,
      campaignId: campaign.id,
      creatorId: creator.influencerId,
      creatorName: handles.get(creator.influencerId) ?? creator.influencerId,
      campaignName: campaign.name,
      resultUrl: creator.uploadUrl,
      amount: creator.fee,
      contractAmount: creator.contractAmount,
      metrics: {
        views: creator.views,
        likes: creator.likes,
        comments: creator.comments,
        saves: creator.saves ?? 0,
        shares: creator.shares ?? 0,
      },
      status: creator.paid ? "completed" as const : creator.settlementStatus === "processing" ? "processing" as const : "pending" as const,
      bankReconciliationNote: creator.bankReconciliationNote ?? "",
    }))
  );
  const manualRows: SettlementRow[] = records.map((record) => ({
    id: record.id,
    source: "manual",
    creatorName: record.creatorName,
    campaignName: record.campaignName,
    resultUrl: record.resultUrl,
    amount: record.amount,
    contractAmount: record.contractAmount,
    metrics: { views: 0, likes: 0, comments: 0, saves: 0, shares: 0, ...record.metrics },
    status: record.status,
    bankReconciliationNote: record.bankReconciliationNote ?? "",
  }));
  const rows = [...manualRows, ...campaignRows];
  const editingNoteRow = rows.find((row) => row.id === editingNoteId);
  const editingContractRow = rows.find((row) => row.id === editingContractId);
  const campaignKey = (name: string) => name.trim().toLocaleLowerCase();
  const campaignTotals = Array.from(rows.reduce((groups, row) => {
    const key = campaignKey(row.campaignName);
    const current = groups.get(key) ?? {
      key,
      name: row.campaignName.trim() || "캠페인 미지정",
      count: 0,
      total: 0,
      pricedCount: 0,
      netProfit: 0,
      contractTotal: 0,
      completed: 0,
    };
    current.count += 1;
    current.total += row.amount;
    if (row.contractAmount !== undefined) {
      current.pricedCount += 1;
      current.netProfit += row.contractAmount - row.amount;
      current.contractTotal += row.contractAmount;
    }
    if (row.status === "completed") current.completed += row.amount;
    groups.set(key, current);
    return groups;
  }, new Map<string, { key: string; name: string; count: number; total: number; pricedCount: number; netProfit: number; contractTotal: number; completed: number }>()).values())
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));

  const payable = rows.reduce((sum, row) => sum + row.amount, 0);
  const completedRows = rows.filter((row) => row.status === "completed");
  const completed = completedRows.reduce((sum, row) => sum + row.amount, 0);
  const pricedRows = rows.filter((row) => row.contractAmount !== undefined);
  const netProfit = pricedRows.reduce((sum, row) => sum + (row.contractAmount ?? 0) - row.amount, 0);
  const overallMargin = marginOf(rows); // 마진율 = 순수익 ÷ 계약대금(계약대금을 입력한 건만)
  const stats: Stat[] = [
    { label: "지급 예정 총액", value: won(payable), footerTitle: `${rows.length}건` },
    { label: "순수익", value: pricedRows.length ? won(netProfit) : "—", footerTitle: `계약대금 입력 ${pricedRows.length}/${rows.length}건 · 기타 비용 제외` },
    { label: "마진율", value: formatMargin(overallMargin.rate), danger: overallMargin.rate !== null && overallMargin.rate < 0, footerTitle: overallMargin.rate === null ? (pricedRows.length ? "계약대금 합계가 0원이라 계산할 수 없습니다" : "계약대금을 입력하면 계산됩니다") : `순수익 ÷ 계약대금 ${won(overallMargin.contract)} · ${pricedRows.length}/${rows.length}건` },
    { label: "완료로 기록", value: won(completed), footerTitle: `${completedRows.length}건 · 은행 대조 전` },
    { label: "미완료", value: won(payable - completed), footerTitle: `${rows.length - completedRows.length}건` },
  ];

  const needle = query.trim().toLocaleLowerCase();
  const visible = rows.filter((row) => {
    if (campaignFilter !== null && campaignKey(row.campaignName) !== campaignFilter) return false;
    if (status !== "all" && row.status !== status) return false;
    return !needle || [row.creatorName, row.campaignName].some((value) => value.toLocaleLowerCase().includes(needle));
  });

  const changeStatus = (row: SettlementRow, next: SettlementStatus) => {
    if (row.source === "campaign" && row.campaignId && row.creatorId) {
      updateCreator(row.campaignId, row.creatorId, {
        paid: next === "completed",
        settlementStatus: next,
      });
    } else if (row.source === "manual") {
      update(row.id, { status: next });
    }
  };

  const openNote = (row: SettlementRow) => {
    setEditingNoteId(row.id);
    setNoteDraft(row.bankReconciliationNote);
  };

  const saveNote = () => {
    if (!editingNoteRow) return;
    const bankReconciliationNote = noteDraft.trim();
    if (editingNoteRow.source === "campaign" && editingNoteRow.campaignId && editingNoteRow.creatorId) {
      updateCreator(editingNoteRow.campaignId, editingNoteRow.creatorId, { bankReconciliationNote });
    } else if (editingNoteRow.source === "manual") {
      update(editingNoteRow.id, { bankReconciliationNote });
    }
    setEditingNoteId(null);
  };

  const openContractAmount = (row: SettlementRow) => {
    setEditingContractId(row.id);
    setContractDraft(row.contractAmount === undefined ? "" : String(row.contractAmount));
    setContractError("");
  };

  const saveContractAmount = () => {
    if (!editingContractRow) return;
    const contractAmount = contractDraft.trim() === "" ? undefined : Number(contractDraft);
    if (contractAmount !== undefined && (!Number.isSafeInteger(contractAmount) || contractAmount < 0)) {
      setContractError("0원 이상의 정수를 입력하거나 비워 주세요.");
      return;
    }
    if (editingContractRow.source === "campaign" && editingContractRow.campaignId && editingContractRow.creatorId) {
      updateCreator(editingContractRow.campaignId, editingContractRow.creatorId, { contractAmount });
    } else if (editingContractRow.source === "manual") {
      update(editingContractRow.id, { contractAmount });
    }
    setEditingContractId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">크리에이터 정산</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            캠페인 정산과 직접 등록한 정산 건을 한곳에서 관리합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/creator-settlements/new"><PlusIcon className="size-4" /> 정산 건 등록</Link>
        </Button>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
        <CardContent className="space-y-1">
          <p className="text-sm font-medium">거래내역 미연결</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            정산 상태는 수동 기록입니다. ‘완료로 기록’을 선택해도 은행 송금이나 실제 이체 확인은 실행되지 않습니다.
            현재 데이터는 이 브라우저에 저장되며 최초 방문 시 예시 캠페인이 표시될 수 있습니다.
          </p>
        </CardContent>
      </Card>

      {ready && <StatGrid stats={stats} className="grid-cols-1 @xl/main:grid-cols-2 @4xl/main:grid-cols-5" />}

      {ready && (
        <Card className="py-0 shadow-xs">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">캠페인별 정산금액</h2>
                <p className="mt-1 text-xs text-muted-foreground">캠페인명을 누르면 아래 정산 목록을 해당 캠페인으로 볼 수 있습니다.</p>
              </div>
              {campaignFilter !== null && <Button type="button" variant="outline" size="sm" onClick={() => setCampaignFilter(null)}>전체 보기</Button>}
            </div>
            {campaignTotals.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">등록된 정산 내역이 없습니다.</p>
            ) : (
              <div className="divide-y">
                {campaignTotals.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    aria-pressed={campaignFilter === group.key}
                    onClick={() => setCampaignFilter((current) => current === group.key ? null : group.key)}
                    className="grid w-full gap-2 px-5 py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary data-[selected=true]:bg-primary/5 sm:grid-cols-2 sm:items-center xl:grid-cols-5 2xl:grid-cols-[minmax(0,1fr)_repeat(5,minmax(0,130px))]"
                    data-selected={campaignFilter === group.key}
                  >
                    <span className="min-w-0 text-sm font-medium sm:col-span-2 xl:col-span-5 2xl:col-span-1"><span className="block truncate">{group.name}</span><span className="text-xs font-normal text-muted-foreground">{group.count}건</span></span>
                    <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:block">지급 예정</span>{won(group.total)}</span>
                    <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:block">순수익 · {group.pricedCount}/{group.count}건</span>{group.pricedCount ? won(group.netProfit) : "—"}</span>
                    <span className={`text-sm tabular-nums ${(marginRate(group.netProfit, group.contractTotal) ?? 0) < 0 ? "text-destructive" : ""}`} data-testid="campaign-margin"><span className="mr-2 text-xs text-muted-foreground sm:block">마진율 · {group.pricedCount}/{group.count}건</span>{formatMargin(marginRate(group.netProfit, group.contractTotal))}</span>
                    <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:block">완료로 기록</span>{won(group.completed)}</span>
                    <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:block">미완료</span>{won(group.total - group.completed)}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="py-0 shadow-xs">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <p className="text-sm font-semibold">정산 목록</p>
              <p className="text-xs text-muted-foreground">{campaignFilter !== null ? `${campaignTotals.find((group) => group.key === campaignFilter)?.name ?? "캠페인"} · ` : ""}표시 {visible.length}건 · 전체 {rows.length}건</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="크리에이터·캠페인 검색"
                  aria-label="크리에이터 또는 캠페인 검색"
                  className="w-56 pl-8"
                />
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                aria-label="정산 상태 필터"
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
              >
                <option value="all">전체 상태</option>
                <option value="pending">정산 대기</option>
                <option value="processing">정산 중</option>
                <option value="completed">완료로 기록</option>
              </select>
            </div>
          </div>

          {!ready ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">정산 내역을 불러오는 중입니다.</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <WalletIcon className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? "등록된 정산 내역이 없습니다." : "조건에 맞는 정산 내역이 없습니다."}
              </p>
              {rows.length === 0 && <Link href="/creator-settlements/new" className="text-xs text-primary hover:underline">첫 정산 건 등록하기</Link>}
            </div>
          ) : (
            <Table className="[&_:is(th,td)]:px-5">
              <TableHeader>
                <TableRow>
                  <TableHead>크리에이터</TableHead>
                  <TableHead>캠페인</TableHead>
                  <TableHead>결과 URL</TableHead>
                  <TableHead className="text-right">ER</TableHead>
                  <TableHead className="text-right">지급 예정액</TableHead>
                  <TableHead className="text-right">계약대금</TableHead>
                  <TableHead className="text-right">마진율</TableHead>
                  <TableHead>정산 상태</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const resultUrl = safeResultUrl(row.resultUrl);
                  const er = resultUrl ? engagementRate(row.metrics) : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.creatorName.startsWith("@") ? row.creatorName : `@${row.creatorName}`}</p>
                        <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                          {row.source === "manual" ? "직접 등록" : "캠페인 연동"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-sm">
                        {row.campaignName || <span className="text-muted-foreground">미입력</span>}
                      </TableCell>
                      <TableCell>
                        {resultUrl ? (
                          <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-44 items-center gap-1 text-xs text-primary hover:underline">
                            <span className="truncate">결과 보기</span><ExternalLinkIcon className="size-3 shrink-0" />
                          </a>
                        ) : <span className="text-xs text-muted-foreground">미등록</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {er === null ? "—" : `${er.toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{won(row.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="xs" variant="ghost" className="tabular-nums" onClick={() => openContractAmount(row)} aria-label={`${row.creatorName} 계약대금 ${row.contractAmount === undefined ? "입력" : "수정"}`}>
                          {row.contractAmount === undefined ? "입력" : won(row.contractAmount)}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid="row-margin">
                        {(() => {
                          const margin = marginOf([row]);
                          return margin.rate === null ? <span className="text-muted-foreground">—</span> : <span className={margin.rate < 0 ? "text-destructive" : ""}>{formatMargin(margin.rate)}</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" role="group" aria-label={`${row.creatorName} 정산 상태`}>
                          {STATUS_OPTIONS.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              size="xs"
                              variant={row.status === option.value ? "default" : "outline"}
                              aria-pressed={row.status === option.value}
                              onClick={() => changeStatus(row, option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <Button type="button" size="xs" variant={row.bankReconciliationNote ? "secondary" : "outline"} onClick={() => openNote(row)}>
                            {row.bankReconciliationNote ? "은행 대조 메모 있음" : "은행 대조 메모"}
                          </Button>
                        <Link
                          href={row.source === "manual" ? `/creator-settlements/${row.id}/edit` : `/campaigns/${row.campaignId}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {row.source === "manual" ? "수정" : "캠페인 열기"}
                          <ArrowUpRightIcon className="size-3" />
                        </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={editingNoteId !== null} onOpenChange={(open) => { if (!open) setEditingNoteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>은행 대조 메모</DialogTitle>
            <DialogDescription>
              {editingNoteRow ? `${editingNoteRow.creatorName} · ${editingNoteRow.campaignName || "캠페인 미입력"}` : "정산 건"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bank-reconciliation-note">확인 내용</Label>
            <Textarea id="bank-reconciliation-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="이체 확인일, 은행 거래내역과의 금액 차이, 확인 담당자 등을 기록하세요." rows={5} />
            <p className="text-xs text-muted-foreground">수동 메모입니다. 은행 거래내역을 자동으로 조회하거나 대조하지 않습니다. 이 브라우저에 저장됩니다.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingNoteId(null)}>취소</Button>
            <Button type="button" onClick={saveNote}>메모 저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editingContractId !== null} onOpenChange={(open) => { if (!open) setEditingContractId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계약대금 입력</DialogTitle>
            <DialogDescription>
              {editingContractRow ? `${editingContractRow.creatorName} · ${editingContractRow.campaignName || "캠페인 미입력"}` : "정산 건"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="contract-amount">이 정산 건에 배분된 계약대금 (원)</Label>
            <Input id="contract-amount" type="number" min="0" step="1" value={contractDraft} onChange={(event) => { setContractDraft(event.target.value); setContractError(""); }} placeholder="예: 800000" />
            <p className="text-xs text-muted-foreground">여러 크리에이터가 한 계약에 속한다면 대금을 건별로 나누어 입력하세요. 순수익은 계약대금에서 지급 예정액만 뺀 값이고 마진율은 순수익을 계약대금으로 나눈 값이며 기타 비용은 포함하지 않습니다. 비우고 저장하면 입력값이 삭제됩니다.</p>
            {contractError && <p role="alert" className="text-xs text-destructive">{contractError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingContractId(null)}>취소</Button>
            <Button type="button" onClick={saveContractAmount}>금액 저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
