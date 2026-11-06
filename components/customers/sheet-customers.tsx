"use client";

import * as React from "react";
import { ExternalLinkIcon, RefreshCw, SearchIcon } from "lucide-react";

import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet";
import type { SheetLeads } from "@/components/sheet-leads-provider";
import { StatGrid, type Stat } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatKst } from "@/lib/format";
import { contractAmountOf, formatContract } from "@/lib/lead-fields";
import { UNASSIGNED } from "@/lib/sales-reps";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

// 구글 시트가 원본인 고객관리. 여기서 '고객'은 시트의 단계가 '계약'인 곳이다(영업이 수동으로 계약 후 넘기는 대상).
// 시트에는 사업자번호·프로젝트·매출 칸이 없어서, 문의 횟수와 계약 금액(시트의 '계약 금액' 칸)으로 보여 준다.

const PAGE = 50;
const digits = (s: string) => s.replace(/\D/g, "");
// 첫 문의 + 재문의 횟수
const inquiryCount = (c: Customer) => 1 + Number(c.tags.find((t) => /^재문의 \d+회$/.test(t))?.replace(/\D/g, "") ?? 0);

export function SheetCustomers({ sheet }: { sheet: SheetLeads }) {
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const clients = React.useMemo(
    () =>
      sheet.customers
        .filter((c) => c.stage === "won" && !c.tags.includes("실패/종료"))
        .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)),
    [sheet.customers]
  );
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = digits(q);
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (qd.length >= 3 && digits(c.phone).includes(qd))
    );
  }, [clients, query]);

  const withAmount = clients.filter((c) => contractAmountOf(c.tags) > 0);
  const total = clients.reduce((s, c) => s + contractAmountOf(c.tags), 0);
  const n = (v: number) => v.toLocaleString("ko-KR");
  const stats: Stat[] = [
    { label: "총 고객 수", value: `${n(clients.length)}곳`, footerTitle: "시트에서 단계가 '계약'인 고객" },
    { label: "계약 금액 기재", value: `${n(withAmount.length)}곳`, footerTitle: `전체 ${n(clients.length)}곳 중` },
    { label: "누적 계약 금액", value: formatContract(total), footerTitle: "고객별 계약 금액의 합계" },
  ];

  const detail = detailId ? (sheet.customers.find((c) => c.id === detailId) ?? null) : null;
  const shown = filtered.slice(0, limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">계약이 끝난 고객 · 시트가 원본입니다 · 총 {n(clients.length)}곳</p>
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
        <span>· 30초마다 새로 확인</span>
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

      <StatGrid stats={stats} className="grid-cols-1 @xl/main:grid-cols-3 @5xl/main:grid-cols-3" />

      <div className="relative w-full max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="고객명·연락처·이메일·서비스 검색"
          aria-label="고객 검색"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              아직 계약된 고객이 없습니다. 시트의 &lsquo;단계&rsquo; 칸이 &lsquo;계약&rsquo;이 되면 여기에 나타납니다.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">검색 결과 없음</div>
          ) : (
            <Table className="[&_:is(th,td)]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead>고객명</TableHead>
                  <TableHead>서비스</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead className="w-36">담당 영업</TableHead>
                  <TableHead className="w-24 text-right">문의 횟수</TableHead>
                  <TableHead className="w-36 text-right">계약 금액</TableHead>
                  <TableHead className="w-32">최근 활동</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((c) => {
                  const amount = contractAmountOf(c.tags);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <button type="button" onClick={() => setDetailId(c.id)} className="text-left hover:underline">
                          {c.company}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{c.phone || "-"}</TableCell>
                      <TableCell>
                        {c.owner === UNASSIGNED ? (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                            미배정
                          </Badge>
                        ) : (
                          <span className="text-xs">{c.owner}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{n(inquiryCount(c))}건</TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">{amount > 0 ? formatContract(amount) : "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatKst(c.lastActivityAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {filtered.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            더 보기 ({n(Math.min(PAGE, filtered.length - limit))}곳 더)
          </Button>
        </div>
      )}

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
