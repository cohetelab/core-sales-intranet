"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkspaceConfig } from "@/components/workspace-config";
import { OTHER_OWNER, attainment, contractsByOwner, manwon, recentMonths, won } from "@/lib/lead-target";
import { SALES_REPS } from "@/lib/sales-reps";
import { setTarget } from "@/lib/workspace-config";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";

// 월 목표 달성률: 영업별 이번 달(또는 지난달) 계약 금액 ÷ 월 목표. 목표는 팀 공용(화면 설정과 같은 저장소)이라 누가 바꿔도 모두에게 보인다.
// 계약 날짜 칸이 시트에 없어서, 계약 시점은 '성사'로 옮긴 기록(정확)이나 마지막 활동(추정)으로 정한다.

function TargetInput({ rep, value }: { rep: string; value: number | undefined }) {
  const { update, admin, user, sync } = useWorkspaceConfig();
  // 관리자는 모두의 목표를, 일반 영업은 본인 목표만 바꾼다(서버도 같은 규칙으로 막는다). 팀 저장소를 못 쓰는 동안은 이 브라우저에서만 적용되므로 막지 않는다.
  const editable = admin || rep === user || sync.state === "local";
  const shown = value ? String(Math.round(value / 10_000)) : "";
  const [text, setText] = React.useState(shown);
  React.useEffect(() => setText(shown), [shown]); // 다른 사람이 바꾼 값이 오면 따라간다
  function commit() {
    const digits = text.replace(/\D/g, "");
    const amount = digits === "" ? null : Number(digits) * 10_000;
    if ((amount ?? undefined) === value) {
      setText(shown);
      return;
    }
    update((c) => setTarget(c, rep, amount));
  }
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="sr-only">{rep} 월 목표(만원)</span>
      <span aria-hidden>목표</span>
      <Input
        inputMode="numeric"
        aria-label={`${rep.replace(/\(.*\)/, "")} 월 목표(만원)`}
        placeholder={editable ? "미설정" : "-"}
        title={editable ? undefined : "다른 사람의 목표는 관리자만 바꿀 수 있습니다"}
        disabled={!editable}
        className="h-7 w-24 text-right text-xs tabular-nums"
        value={text}
        maxLength={7}
        onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span aria-hidden>만원</span>
    </label>
  );
}

function Bar({ pct, reached }: { pct: number | null; reached: boolean }) {
  const w = pct === null ? 0 : Math.min(100, pct);
  return (
    <div role="progressbar" aria-label="달성률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(w)} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", reached ? "bg-emerald-500" : "bg-primary")} style={{ width: `${w}%` }} />
    </div>
  );
}

export function TargetCard({ customers, nowMs }: { customers: Customer[]; nowMs: number }) {
  const { config } = useWorkspaceConfig();
  const [thisMonth, lastMonth] = recentMonths(nowMs, 2);
  const [month, setMonth] = React.useState(thisMonth);
  const rows = React.useMemo(() => contractsByOwner(customers, month, nowMs), [customers, month, nowMs]);
  const reps = rows.filter((r) => (SALES_REPS as readonly string[]).includes(r.owner));
  const other = rows.find((r) => r.owner === OTHER_OWNER);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totalAmount = sum((r) => r.amount);
  const totalTarget = reps.reduce((a, r) => a + (config.targets[r.owner] ?? 0), 0);
  const teamAtt = attainment(reps.reduce((a, r) => a + r.amount, 0), totalTarget);
  const noAmount = sum((r) => r.noAmount);
  const estimated = sum((r) => r.estimated);
  const label = `${Number(month.slice(5))}월`;

  return (
    <Card className="shadow-xs" role="region" aria-label="월 목표 달성률">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">월 목표 달성률 · {label} 계약 금액</h3>
          <div className="flex items-center gap-1.5">
            {[thisMonth, lastMonth].map((m) => (
              <Button key={m} type="button" size="sm" variant={month === m ? "default" : "outline"} aria-pressed={month === m} className="h-7 rounded-full px-2.5 text-xs" onClick={() => setMonth(m)}>
                {m === thisMonth ? "이번 달" : "지난달"}
              </Button>
            ))}
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link href="/reports#monthly-sales">
                월별 보기 <ArrowRightIcon className="size-3" />
              </Link>
            </Button>
          </div>
        </div>

        <ul className="space-y-3" aria-label="영업별 달성률">
          {reps.map((r) => {
            const target = config.targets[r.owner];
            const att = attainment(r.amount, target);
            return (
              <li key={r.owner} className="space-y-1.5" aria-label={`${r.owner} 달성률`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.owner}</span>
                  <TargetInput rep={r.owner} value={target} />
                </div>
                <Bar pct={att.pct} reached={att.reached} />
                <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground tabular-nums">{manwon(r.amount)}</span> · 계약 {r.count}건
                  </span>
                  <span className="tabular-nums" data-testid="att">
                    {att.pct === null ? "목표를 입력하면 달성률이 보입니다" : `달성률 ${att.pct}%${att.reached ? " · 달성" : ` · ${manwon(att.remaining ?? 0)} 남음`}`}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>

        <div className="space-y-1.5 border-t pt-3" aria-label="팀 합계">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">팀 합계</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              <span className="text-base font-semibold text-foreground">{won(totalAmount)}</span>
              {totalTarget > 0 && <> / 목표 {manwon(totalTarget)} · {teamAtt.pct}%</>}
            </span>
          </div>
          {other && other.count > 0 && (
            <p className="text-xs text-muted-foreground">
              담당 영업이 아닌 계약 {other.count}건({manwon(other.amount)})은 합계에만 포함됩니다 — 담당자가 미배정이거나 퇴사한 건입니다.
            </p>
          )}
          {(noAmount > 0 || estimated > 0) && (
            <p className="text-xs text-amber-700" role="note">
              {noAmount > 0 && <>계약 금액이 비어 있는 계약 {noAmount}건은 0원으로 세었습니다. </>}
              {estimated > 0 && <>계약한 날짜를 모르는 {estimated}건은 마지막 활동 시점으로 추정했습니다(지금부터 &lsquo;성사&rsquo;로 옮기면 정확히 기록됩니다).</>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
