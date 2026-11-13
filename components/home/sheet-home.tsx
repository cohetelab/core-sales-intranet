"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronRightIcon, CircleIcon, RefreshCw } from "lucide-react";

import { ColumnWarning } from "@/components/column-warning";
import type { SheetLeads } from "@/components/sheet-leads-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IRM_LIMIT, useCreatorIrm } from "@/lib/creator-irm-store";
import { formatDateTime, formatKst } from "@/lib/format";
import { CHECKS, runChecks } from "@/lib/lead-checks";
import { formatContract, todayKst } from "@/lib/lead-fields";
import { agoFrom, homeSummary } from "@/lib/lead-home";
import { formatDuration, responseStats } from "@/lib/lead-response";
import { inWindow, monthly } from "@/lib/lead-report";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// 구글 시트가 원본인 홈. 샘플 데이터(MRR·가짜 일정) 대신 시트의 실제 고객으로 오늘 할 일과 현황을 보여 준다.

const n = (v: number) => v.toLocaleString("ko-KR");

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="size-2 rounded-full bg-primary" />
        {children}
      </h2>
      {action}
    </div>
  );
}

function SeeAll({ href, label = "전체 보기" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
      {label} <ChevronRightIcon className="size-3" />
    </Link>
  );
}

export function SheetHome({ sheet }: { sheet: SheetLeads }) {
  const irm = useCreatorIrm();
  const [nowMs] = React.useState(() => Date.now());
  const today = todayKst(nowMs);

  const s = React.useMemo(() => homeSummary(sheet.customers, today), [sheet.customers, today]);
  const checks = React.useMemo(() => runChecks(sheet.customers, nowMs, today), [sheet.customers, nowMs, today]);
  const response = React.useMemo(() => responseStats(sheet.customers, nowMs), [sheet.customers, nowMs]);
  const months = React.useMemo(() => monthly(inWindow(sheet.customers, nowMs, null)).slice(0, 6).reverse(), [sheet.customers, nowMs]);

  const todayLabel = new Date(`${today}T12:00:00+09:00`).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" });
  const maxStage = Math.max(1, ...STAGE_ORDER.map((st) => s.stageCounts[st]));
  const maxMonth = Math.max(1, ...months.map((m) => m.inquiries));
  const irmCount = Object.keys(irm.entries).length;
  const dueRatio = s.withDue ? Math.round((s.due3 / s.withDue) * 100) : 0;
  const checkTotal = Object.values(checks).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xl text-muted-foreground">{todayLabel}</p>
          <h2 className="text-3xl font-semibold tracking-tight">오늘의 업무</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            구글 시트 연동 · 시트가 원본입니다
            {sheet.fetchedAt && <> · 마지막 확인 {formatDateTime(sheet.fetchedAt)}</>}
          </span>
          <Button variant="outline" className="h-9 py-2" disabled={sheet.refreshing} onClick={() => void sheet.refresh()}>
            <RefreshCw className={`size-3.5 ${sheet.refreshing ? "animate-spin" : ""}`} /> 새로고침
          </Button>
          <Button asChild className="h-9 py-2">
            <Link href="/leads">
              리드 인박스 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr_1fr]">
        <Card className="shadow-xs">
          <CardContent className="flex h-full flex-col gap-5">
            <SectionTitle>영업 현황</SectionTitle>
            <div>
              <p className="text-xs text-muted-foreground">계약 금액 합계</p>
              <p className="text-3xl font-semibold tabular-nums">{formatContract(s.wonAmount)}</p>
              <p className="text-xs text-muted-foreground">
                계약 {n(s.won)}곳 · 금액 기재 {n(s.wonWithAmount)}곳
              </p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">진행 중(계약 전)</span>
              <span className="font-medium tabular-nums">{n(s.open)}건</span>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{n(s.total)}</p>
                <p className="text-xs text-muted-foreground">전체 고객</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{(Math.round(s.conversionRate * 1000) / 10).toLocaleString("ko-KR")}%</p>
                <p className="text-xs text-muted-foreground">문의→계약 전환율</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="flex h-full flex-col gap-4">
            <SectionTitle action={<SeeAll href="/pipeline" />}>파이프라인 분석</SectionTitle>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-muted-foreground">진행 중 딜</p>
                <p className="text-3xl font-semibold tabular-nums">{n(s.open)}건</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">계약 완료</p>
                <p className="text-3xl font-semibold tabular-nums">{n(s.won)}건</p>
              </div>
            </div>
            <div className="mt-2 flex flex-1 items-end gap-5 pb-1" role="img" aria-label="단계별 고객 수">
              {STAGE_ORDER.map((st) => (
                <div key={st} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-medium tabular-nums">{n(s.stageCounts[st])}</span>
                  <div
                    className={`w-full max-w-14 rounded-2xl ${st === "won" ? "bg-primary" : "bg-primary/25"}`}
                    style={{ height: `${Math.max(12, (s.stageCounts[st] / maxStage) * 120)}px` }}
                  />
                  <span className="text-xs text-muted-foreground">{STAGE_LABEL[st]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionTitle>오늘·내일 일정</SectionTitle>
              <span className="text-2xl font-semibold tabular-nums">{n(s.dueSoon.length)}</span>
            </div>
            {s.overdue > 0 && <p className="text-xs text-destructive">기한이 지난 일정 {n(s.overdue)}건</p>}
            {s.dueSoon.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">처리할 일정이 없습니다</p>
            ) : (
              <ul className="space-y-2.5">
                {s.dueSoon.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center gap-2.5 text-sm">
                    <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {d.company}
                      {d.nextStep && <> · {d.nextStep}</>}
                    </span>
                    <span className={cn("shrink-0 text-xs tabular-nums", d.day < today ? "text-destructive" : "text-muted-foreground")}>{d.day.slice(5).replace("-", ".")}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto">
              <SeeAll href="/leads" label="리드 인박스에서 일정관리" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1.3fr_1fr]">
        <Card className="shadow-xs">
          <CardContent className="flex flex-col gap-3">
            <SectionTitle action={<SeeAll href="/leads" label="리드 인박스" />}>오늘의 점검</SectionTitle>
            <p className="text-xs text-muted-foreground">{checkTotal === 0 ? "지금 확인할 항목이 없습니다." : "시트 데이터로 자동 계산한 확인 항목입니다."}</p>
            <ul className="divide-y" aria-label="오늘의 점검">
              {CHECKS.map((ch) => (
                <li key={ch.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0">
                  <span title={ch.hint}>{ch.label}</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      checks[ch.id] > 0 && ch.tone === "danger" && "text-destructive",
                      checks[ch.id] > 0 && ch.tone === "warning" && "text-amber-700"
                    )}
                  >
                    {n(checks[ch.id])}건
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="flex flex-col gap-3">
            <SectionTitle action={<SeeAll href="/leads" label="리드 인박스" />}>응답 속도 · 최근 30일</SectionTitle>
            {response.measured === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                아직 측정된 건이 없습니다. 상담 기록을 저장하거나 &lsquo;첫 컨택 완료&rsquo;를 누르면 쌓입니다.
                {response.waiting24h > 0 && <> 24시간 넘게 첫 기록이 없는 문의 {n(response.waiting24h)}건.</>}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">중앙값</p>
                    <p className="text-2xl font-semibold tabular-nums">{formatDuration(response.medianMs)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">1시간 이내</p>
                    <p className="text-2xl font-semibold tabular-nums">{Math.round((response.within1h / response.measured) * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">측정</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {n(response.measured)}/{n(response.total)}
                    </p>
                  </div>
                </div>
                {response.waiting24h > 0 && <p className="text-xs text-destructive">24시간 넘게 첫 기록 없음 {n(response.waiting24h)}건</p>}
              </>
            )}
            <p className="text-xs text-muted-foreground">인트라넷에서 남긴 기록만 집계됩니다.</p>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="shadow-xs">
            <CardContent className="space-y-2">
              <SectionTitle action={<SeeAll href="/leads" label="" />}>마감 임박</SectionTitle>
              <p className="text-3xl font-semibold tabular-nums text-destructive">
                {n(s.due3)}
                <span className="ml-1 text-base text-muted-foreground">건</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-destructive" style={{ width: `${dueRatio}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                3일 내 일정 {n(s.due3)}건 / 일정이 있는 고객 {n(s.withDue)}명 · {dueRatio}%
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardContent className="space-y-2">
              <SectionTitle action={<SeeAll href="/creator-irm" label="" />}>크리에이터 커뮤니티</SectionTitle>
              <p className="text-3xl font-semibold tabular-nums">
                {irmCount}
                <span className="ml-1 text-base text-muted-foreground">명</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (irmCount / IRM_LIMIT) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                컨택 중 {irmCount} / {IRM_LIMIT}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-xs">
          <CardContent className="flex flex-col gap-3">
            <SectionTitle action={<SeeAll href="/reports" label="리포트" />}>월별 문의 (최근 6개월)</SectionTitle>
            {months.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">문의가 없습니다</p>
            ) : (
              <ul className="space-y-2" aria-label="월별 문의">
                {months.map((m) => (
                  <li key={m.month} className="flex items-center gap-3 text-xs">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{m.month}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/40" style={{ width: `${(m.inquiries / maxMonth) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right tabular-nums">
                      {n(m.inquiries)}건 · 계약 {n(m.contracted)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="flex flex-col gap-3">
            <SectionTitle action={<SeeAll href="/leads" label="리드 인박스" />}>최근 활동</SectionTitle>
            {s.activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">활동이 없습니다</p>
            ) : (
              <ul className="divide-y" aria-label="최근 활동">
                {s.activity.map((a) => (
                  <li key={a.key} className="py-2.5 first:pt-0">
                    <p className="truncate text-sm">
                      <span className="font-medium">{a.company}</span> · {a.summary}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatKst(a.at)} · {agoFrom(a.at, nowMs)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
