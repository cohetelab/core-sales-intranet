"use client";

import * as React from "react";
import { ExternalLinkIcon, RefreshCw } from "lucide-react";

import { ColumnWarning } from "@/components/column-warning";
import type { SheetLeads } from "@/components/sheet-leads-provider";
import { StatGrid, type Stat } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { formatContract } from "@/lib/lead-fields";
import { channelOf, funnelBy, inWindow, monthly, servicesOf, totals, type FunnelRow } from "@/lib/lead-report";
import { cn } from "@/lib/utils";

// 구글 시트가 원본인 리포트: 채널·서비스·월별로 문의 → 상담 → 계약이 어떻게 이어지는지 본다.
// 시트에 캠페인·소재 칸이 없어서 지금은 채널(홈페이지/META/유선)까지만 구분한다.

type Period = "all" | "90" | "30" | "7" | "1";
const PERIODS: { id: Period; label: string; days: number | null }[] = [
  { id: "all", label: "전체 기간", days: null },
  { id: "90", label: "최근 90일", days: 90 },
  { id: "30", label: "최근 30일", days: 30 },
  { id: "7", label: "최근 7일", days: 7 },
  { id: "1", label: "최근 1일", days: 1 },
];

const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("ko-KR")}%`;

function FunnelTable({ title, label, rows }: { title: string; label: string; rows: FunnelRow[] }) {
  return (
    <Card className="shadow-xs py-0">
      <CardHeader className="pt-5 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">이 기간에 들어온 문의가 없습니다</p>
        ) : (
          <Table className="[&_:is(th,td)]:px-4" aria-label={title}>
            <TableHeader>
              <TableRow>
                <TableHead>{label}</TableHead>
                <TableHead className="text-right">문의</TableHead>
                <TableHead className="text-right">상담 기록 이상</TableHead>
                <TableHead className="text-right">계약</TableHead>
                <TableHead className="text-right">전환율</TableHead>
                <TableHead className="text-right">계약 금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(r.inquiries)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(r.engaged)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(r.contracted)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.rate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.amount > 0 ? formatContract(r.amount) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SheetReports({ sheet }: { sheet: SheetLeads }) {
  const [period, setPeriod] = React.useState<Period>("all");
  const [nowMs] = React.useState(() => Date.now());

  const scope = React.useMemo(
    () => inWindow(sheet.customers, nowMs, PERIODS.find((p) => p.id === period)?.days ?? null),
    [sheet.customers, nowMs, period]
  );
  const t = React.useMemo(() => totals(scope), [scope]);
  const byChannel = React.useMemo(() => funnelBy(scope, (c) => [channelOf(c)]), [scope]);
  const byService = React.useMemo(() => funnelBy(scope, servicesOf), [scope]);
  const months = React.useMemo(() => monthly(scope), [scope]);
  const channels = React.useMemo(() => Array.from(new Set(months.flatMap((m) => Object.keys(m.byChannel)))), [months]);

  const stats: Stat[] = [
    { label: "문의 고객", value: `${n(t.inquiries)}명`, footerTitle: "재문의는 한 명으로 합쳐 셈 · 실패/종료 제외" },
    { label: "상담 기록 이상", value: `${n(t.engaged)}명`, footerTitle: t.inquiries ? `문의의 ${pct(t.engaged / t.inquiries)}` : "-" },
    { label: "계약", value: `${n(t.contracted)}명`, footerTitle: t.inquiries ? `문의 대비 ${pct(t.contracted / t.inquiries)}` : "-" },
    { label: "계약 금액 합계", value: formatContract(t.amount), footerTitle: `금액이 적힌 계약 ${n(t.withAmount)}건 / 전체 ${n(t.contracted)}건` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">채널·서비스·월별 문의 → 상담 → 계약 · 시트 기준</p>
        <div className="flex flex-wrap gap-2">
          {sheet.sheetUrl.startsWith("https://docs.google.com/") && (
            <Button asChild variant="outline" className="h-9 py-2">
              <a href={sheet.sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-3.5" /> 시트 열기
              </a>
            </Button>
          )}
          <Button variant="outline" className="h-9 py-2" disabled={sheet.refreshing} onClick={() => void sheet.refresh()}>
            <RefreshCw className={`size-3.5 ${sheet.refreshing ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          구글 시트 연동 · 시트가 원본입니다
        </span>
        {sheet.fetchedAt && <span>· 마지막 확인 {formatDateTime(sheet.fetchedAt)}</span>}
        {sheet.user && <span>· {sheet.user}</span>}
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

      <ColumnWarning missing={sheet.missing} />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기간">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
            className={cn(
              "inline-flex h-8 items-center rounded-2xl px-3 text-xs ring-1 ring-foreground/10 transition-colors",
              period === p.id ? "bg-primary text-primary-foreground ring-primary" : "hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <StatGrid stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelTable title="채널별" label="채널" rows={byChannel} />
        <FunnelTable title="서비스별" label="서비스" rows={byService} />
      </div>

      <Card className="shadow-xs py-0">
        <CardHeader className="pt-5 pb-2">
          <CardTitle className="text-sm font-medium">월별 문의</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {months.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">이 기간에 들어온 문의가 없습니다</p>
          ) : (
            <Table className="[&_:is(th,td)]:px-4" aria-label="월별 문의">
              <TableHeader>
                <TableRow>
                  <TableHead>월</TableHead>
                  <TableHead className="text-right">문의</TableHead>
                  {channels.map((c) => (
                    <TableHead key={c} className="text-right">
                      {c}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">계약</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium tabular-nums">{m.month}</TableCell>
                    <TableCell className="text-right tabular-nums">{n(m.inquiries)}</TableCell>
                    {channels.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums text-muted-foreground">
                        {n(m.byChannel[c] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{n(m.contracted)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xs py-0">
        <CardContent className="space-y-1 py-4 text-xs text-muted-foreground">
          <h2 className="text-sm font-medium text-foreground">숫자를 볼 때 알아 둘 점</h2>
          <ul className="list-disc space-y-1 pl-4">
            <li>계약은 시트의 &lsquo;단계&rsquo;가 계약이거나, 단계 칸이 비어 있고 &lsquo;계약 금액&rsquo;이 적힌 고객입니다. 다른 화면(파이프라인·고객사)도 같은 기준입니다.</li>
            <li>상담 기록 이상은 단계가 리드가 아니거나, 상담 내용이 적혀 있거나, 계약인 고객입니다. 전화만 하고 시트에 적지 않은 건 빠집니다.</li>
            <li>시트에 캠페인·소재 칸이 없어서 지금은 채널까지만 나눌 수 있습니다. 광고·소재별로 보려면 시트에 그 칸이 필요합니다.</li>
            <li>최근에 들어온 문의는 아직 계약까지 가는 중이라 전환율이 낮게 보일 수 있습니다.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
