"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLOSE_REASONS } from "@/lib/lead-cleanup";
import { WIN_REASONS, wonReasonBreakdown } from "@/lib/lead-won";
import type { Customer } from "@/lib/types";

// 이기고 지는 이유를 한 표에서 비교한다. 이긴 이유는 계약 전환 때 고른 성사 이유, 진 이유는 종료 처리 때 고른 종료 사유다.
// 같은 이름(가격·기타)은 한 줄로 합쳐 "가격 때문에 이긴 건 vs 가격 때문에 진 건"을 바로 본다.
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const n = (v: number) => v.toLocaleString("ko-KR");

export function WinLoseReasons({ customers, nowMs, periodDays, lose, loseTotal }: { customers: Customer[]; nowMs: number; periodDays: number | null; lose: Record<string, number>; loseTotal: number }) {
  const win = React.useMemo(() => wonReasonBreakdown(customers, nowMs, periodDays), [customers, nowMs, periodDays]);
  const winOf = (r: string) => win.rows.find((x) => x.reason === r);
  const labels = [...WIN_REASONS, ...CLOSE_REASONS.filter((r) => !(WIN_REASONS as readonly string[]).includes(r))];
  const winNone = winOf("none");

  return (
    <Card className="shadow-xs py-0" role="region" aria-label="이기고 지는 이유">
      <CardHeader className="pt-5 pb-2">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
          <span>
            이기고 지는 이유 <span className="font-normal text-muted-foreground">· 이긴 이유는 계약 전환, 진 이유는 종료 처리 때 고릅니다</span>
          </span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            이김 {n(win.total)}건 / 짐 {n(loseTotal)}명
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="[&_:is(th,td)]:px-4" aria-label="성사·종료 이유 비교">
          <TableHeader>
            <TableRow>
              <TableHead>이유</TableHead>
              <TableHead className="text-right">이긴 건수 (계약 금액)</TableHead>
              <TableHead className="text-right">진 건수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labels.map((r) => {
              const w = winOf(r);
              const l = lose[r] ?? 0;
              return (
                <TableRow key={r} data-reason={r}>
                  <TableCell className="font-medium">{r}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w && w.count > 0 ? (
                      <>
                        {n(w.count)}건<span className="text-muted-foreground"> ({won(w.amount)})</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l > 0 ? `${n(l)}명` : <span className="text-muted-foreground">-</span>}</TableCell>
                </TableRow>
              );
            })}
            <TableRow data-reason="none">
              <TableCell className="text-muted-foreground">이유 기록 안 함</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{winNone && winNone.count > 0 ? `${n(winNone.count)}건` : "-"}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{(lose.none ?? 0) > 0 ? `${n(lose.none ?? 0)}명` : "-"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          성사 이유는 리드 인박스의 &lsquo;계약 전환&rsquo; 창에서 고릅니다(칸반으로 옮긴 계약에는 이유가 남지 않습니다). 이긴 건수는 이 기간에 계약한 고객, 진 건수는 아래 &lsquo;종료 사유&rsquo;와 같은 기준(이 기간에 들어온 문의 중 종료)입니다.
        </p>
      </CardContent>
    </Card>
  );
}
