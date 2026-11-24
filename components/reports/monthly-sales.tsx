"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspaceConfig } from "@/components/workspace-config";
import { OTHER_OWNER, attainment, contractsByOwner, manwon, recentMonths, won } from "@/lib/lead-target";
import { SALES_REPS } from "@/lib/sales-reps";
import type { Customer } from "@/lib/types";

// 월별 영업 계약 금액(최근 6개월): 영업별 계약 금액과 목표 대비 달성률. 기간 필터와 상관없이 항상 최근 6개월을 보여 준다.
// 목표는 홈의 '월 목표 달성률' 카드에서 입력한다(팀 공용). 과거 달도 지금 목표로 계산한다.
export function MonthlySales({ customers, nowMs }: { customers: Customer[]; nowMs: number }) {
  const { config } = useWorkspaceConfig();
  const months = React.useMemo(() => recentMonths(nowMs, 6), [nowMs]);
  const table = React.useMemo(() => months.map((m) => ({ month: m, rows: contractsByOwner(customers, m, nowMs) })), [months, customers, nowMs]);
  const hasOther = table.some((t) => t.rows.some((r) => r.owner === OTHER_OWNER && r.count > 0));
  const hasTarget = SALES_REPS.some((r) => config.targets[r]);
  const estimated = table.reduce((a, t) => a + t.rows.reduce((b, r) => b + r.estimated, 0), 0);
  const noAmount = table.reduce((a, t) => a + t.rows.reduce((b, r) => b + r.noAmount, 0), 0);

  return (
    <Card className="shadow-xs py-0" id="monthly-sales">
      <CardHeader className="pt-5 pb-2">
        <CardTitle className="text-sm font-medium">월별 영업 계약 금액 (최근 6개월)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="[&_:is(th,td)]:px-4" aria-label="월별 영업 계약 금액">
          <TableHeader>
            <TableRow>
              <TableHead>월</TableHead>
              {SALES_REPS.map((r) => (
                <TableHead key={r} className="text-right">
                  {r}
                  <span className="block text-[11px] font-normal text-muted-foreground">{config.targets[r] ? `목표 ${manwon(config.targets[r])}` : "목표 미설정"}</span>
                </TableHead>
              ))}
              {hasOther && <TableHead className="text-right">기타(미배정·퇴사)</TableHead>}
              <TableHead className="text-right">합계</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.map(({ month, rows }) => {
              const total = rows.reduce((a, r) => a + r.amount, 0);
              const count = rows.reduce((a, r) => a + r.count, 0);
              return (
                <TableRow key={month} data-month={month}>
                  <TableCell className="font-medium tabular-nums">{month}</TableCell>
                  {SALES_REPS.map((rep) => {
                    const r = rows.find((x) => x.owner === rep);
                    const att = attainment(r?.amount ?? 0, config.targets[rep]);
                    return (
                      <TableCell key={rep} className="text-right tabular-nums">
                        {r && r.count > 0 ? won(r.amount) : <span className="text-muted-foreground">-</span>}
                        <span className="block text-[11px] text-muted-foreground">
                          {r?.count ?? 0}건{att.pct !== null && <> · 달성률 {att.pct}%</>}
                        </span>
                      </TableCell>
                    );
                  })}
                  {hasOther && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(() => {
                        const o = rows.find((x) => x.owner === OTHER_OWNER);
                        return o && o.count > 0 ? `${won(o.amount)} · ${o.count}건` : "-";
                      })()}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-medium tabular-nums">
                    {count > 0 ? won(total) : <span className="font-normal text-muted-foreground">-</span>}
                    <span className="block text-[11px] font-normal text-muted-foreground">{count}건</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
          <p>계약 금액은 시트의 &lsquo;계약 금액&rsquo; 칸, 계약한 달은 &lsquo;성사&rsquo;로 옮긴 기록 시각으로 계산합니다.{!hasTarget && " 목표는 홈의 ‘월 목표 달성률’ 카드에서 입력하면 달성률이 함께 보입니다."}</p>
          {(estimated > 0 || noAmount > 0) && (
            <p className="text-amber-700" role="note">
              {estimated > 0 && <>계약한 날짜를 모르는 {estimated}건은 마지막 활동 시점으로 추정한 달에 들어갔습니다. </>}
              {noAmount > 0 && <>계약 금액이 비어 있는 {noAmount}건은 0원으로 세었습니다.</>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
