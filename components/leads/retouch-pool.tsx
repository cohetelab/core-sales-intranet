"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, RotateCcwIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SheetLeads } from "@/components/sheet-leads-provider";
import { formatKst } from "@/lib/format";
import { CLOSE_REASONS, type CloseReason } from "@/lib/lead-cleanup";
import {
  COLD_REASONS,
  DEFAULT_RETOUCH_FILTER,
  IDLE_OPTIONS,
  MAX_AGE_OPTIONS,
  MIN_AGE_OPTIONS,
  PROBABILITY_OPTIONS,
  retouchMessage,
  retouchPool,
  type RetouchFilter,
} from "@/lib/lead-retouch";
import { SERVICE_LABELS, planBalancedAssignment } from "@/lib/lead-sheet";
import { servicesOf } from "@/lib/lead-report";
import { SALES_REPS, UNASSIGNED } from "@/lib/sales-reps";
import { cn } from "@/lib/utils";

// 리터치 풀: 쌓여 있는 옛 DB를 조건으로 걸러 영업에게 일괄 배정한다. 시트에는 '리드 온도' 칸이 없어서
// 종료 사유(가격·경쟁사 기본 제외)·가능성·마지막 움직임으로 거른다. 배정하면 시트의 담당자 칸이 바뀌고 상담 내용에 줄이 남는다.

const PAGE_SIZE = 50;
const n = (v: number) => v.toLocaleString("ko-KR");

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} aria-label={label} className="h-7 rounded-full px-2.5 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={title}>
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

export function RetouchPool({ sheet, nowMs, onOpen, onBack }: { sheet: SheetLeads; nowMs: number; onOpen: (id: string) => void; onBack: () => void }) {
  const [filter, setFilter] = React.useState<RetouchFilter>(DEFAULT_RETOUCH_FILTER);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [owner, setOwner] = React.useState<string>(SALES_REPS[0]);
  const [reopen, setReopen] = React.useState(true);
  const [page, setPage] = React.useState(0);
  const [copied, setCopied] = React.useState<string | null>(null);
  const busy = Boolean(sheet.bulk);

  const rows = React.useMemo(() => retouchPool(sheet.customers, filter, nowMs), [sheet.customers, filter, nowMs]);
  const rowIds = React.useMemo(() => new Set(rows.map((r) => r.customer.id)), [rows]);
  // 필터를 바꾸면 풀에서 빠진 고객은 선택에서도 뺀다(눈에 안 보이는 고객을 배정하지 않도록)
  const picked = React.useMemo(() => rows.filter((r) => selected.has(r.customer.id)), [rows, selected]);
  const pickedClosed = picked.filter((r) => r.closed).length;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const view = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const allSelected = rows.length > 0 && picked.length === rows.length;

  const set = (patch: Partial<RetouchFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(0);
  };
  const toggleReason = (r: CloseReason) => set({ excludeReasons: filter.excludeReasons.includes(r) ? filter.excludeReasons.filter((x) => x !== r) : [...filter.excludeReasons, r] });
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) => setSelected(on ? new Set(rows.map((r) => r.customer.id)) : new Set());

  const ownerLoad = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const rep of SALES_REPS) m[rep] = sheet.customers.filter((c) => c.owner === rep && c.stage !== "won").length;
    return m;
  }, [sheet.customers]);

  async function assignTo(ids: string[], to: string) {
    if (ids.length === 0) return 0;
    return sheet.retouch(ids, to, reopen);
  }
  async function run(mode: "one" | "split") {
    const ids = picked.map((r) => r.customer.id).filter((id) => rowIds.has(id));
    if (mode === "one") await assignTo(ids, owner);
    else {
      const plan = planBalancedAssignment(ids, ownerLoad);
      for (const rep of SALES_REPS) await assignTo(plan[rep], rep);
    }
    setSelected(new Set());
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  }

  const resetFilter = () => {
    setFilter(DEFAULT_RETOUCH_FILTER);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">리터치 풀 · 쌓여 있는 옛 DB를 다시 배정해 재접촉</p>
          <p className="text-xs text-muted-foreground">
            시트에 &lsquo;리드 온도&rsquo; 칸이 없어서 종료 사유·가능성·마지막 움직임으로 거릅니다. 계약된 고객과 앞으로 일정이 잡힌 고객은 이미 진행 중이라 빠집니다.
          </p>
        </div>
        <Button variant="outline" className="h-9 py-2" onClick={onBack}>
          <ChevronLeftIcon className="size-3.5" /> 리드로 돌아가기
        </Button>
      </div>

      {sheet.notice && (
        <div role="alert" className={cn("flex items-start justify-between gap-3 rounded-2xl px-3 py-2 text-xs", sheet.notice.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground")}>
          <span>{sheet.notice.text}</span>
          <button type="button" onClick={sheet.dismissNotice} className="shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      <section aria-label="풀 조건" className="space-y-2 rounded-2xl border p-3">
        <Group title="문의 경과">
          {MIN_AGE_OPTIONS.map((d) => (
            <Chip key={d} active={filter.minAgeDays === d} onClick={() => set({ minAgeDays: d })} label={`문의 ${d}일 이상`}>
              {d}일 이상
            </Chip>
          ))}
          <span className="px-1 text-[11px] text-muted-foreground">~</span>
          <Chip active={filter.maxAgeDays === null} onClick={() => set({ maxAgeDays: null })} label="상한 없음">
            상한 없음
          </Chip>
          {MAX_AGE_OPTIONS.map((d) => (
            <Chip key={d} active={filter.maxAgeDays === d} onClick={() => set({ maxAgeDays: d })} label={`문의 ${d}일 이하`}>
              {d}일 이하
            </Chip>
          ))}
        </Group>
        <Group title="마지막 움직임">
          {IDLE_OPTIONS.map((d) => (
            <Chip key={d} active={filter.idleMinDays === d} onClick={() => set({ idleMinDays: d })} label={`움직임 ${d}일 이상 없음`}>
              {d}일 이상 없음
            </Chip>
          ))}
        </Group>
        <Group title="종료된 건">
          <Chip active={filter.includeClosed} onClick={() => set({ includeClosed: !filter.includeClosed })} label="종료된 건 포함">
            종료된 건 포함
          </Chip>
          {filter.includeClosed && (
            <>
              <span className="px-1 text-[11px] text-muted-foreground">제외할 사유</span>
              {CLOSE_REASONS.map((r) => (
                <Chip key={r} active={filter.excludeReasons.includes(r)} onClick={() => toggleReason(r)} label={`${r} 사유 제외`}>
                  {r} 제외
                </Chip>
              ))}
            </>
          )}
        </Group>
        <Group title="가능성">
          <Chip active={filter.minProbability === null} onClick={() => set({ minProbability: null })} label="가능성 제한 없음">
            제한 없음
          </Chip>
          {PROBABILITY_OPTIONS.map((p) => (
            <Chip key={p} active={filter.minProbability === p} onClick={() => set({ minProbability: p })} label={`가능성 ${p}% 미만 제외`}>
              {p}% 미만 제외
            </Chip>
          ))}
        </Group>
        <Group title="서비스">
          <Chip active={filter.service === "all"} onClick={() => set({ service: "all" })} label="전체 서비스">
            전체
          </Chip>
          {[...SERVICE_LABELS, "미분류"].map((s) => (
            <Chip key={s} active={filter.service === s} onClick={() => set({ service: s })} label={`${s} 서비스`}>
              {s}
            </Chip>
          ))}
        </Group>
        <Group title="담당">
          <Chip active={!filter.unassignedOnly} onClick={() => set({ unassignedOnly: false })} label="담당 전체">
            전체
          </Chip>
          <Chip active={filter.unassignedOnly} onClick={() => set({ unassignedOnly: true })} label="미배정만">
            미배정만
          </Chip>
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={resetFilter}>
            <RotateCcwIcon className="size-3" /> 조건 초기화
          </Button>
        </Group>
        <p className="text-xs text-muted-foreground" role="status" aria-label="풀 건수">
          조건에 맞는 고객 <span className="font-medium text-foreground tabular-nums">{n(rows.length)}</span>명
          {rows.length > 0 && <> · 그중 종료 건 {n(rows.filter((r) => r.closed).length)}명</>}
          {filter.includeClosed && filter.excludeReasons.length > 0 && <> · 제외 사유: {filter.excludeReasons.join(", ")}{COLD_REASONS.every((r) => filter.excludeReasons.includes(r)) ? " (기본)" : ""}</>}
        </p>
      </section>

      {sheet.bulk && (
        <div role="status" className="rounded-2xl bg-muted px-3 py-2 text-xs">
          {sheet.bulk.label} 중… {n(sheet.bulk.done)} / {n(sheet.bulk.total)}건 (창을 닫지 마세요)
        </div>
      )}

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-primary/5 px-3 py-2 text-sm ring-1 ring-primary/20" role="region" aria-label="리터치 배정">
          <span className="font-medium">{n(picked.length)}명 선택됨</span>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="배정할 영업">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALES_REPS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="h-8" disabled={busy}>
                {owner.replace(/\(.*\)/, "")}에게 배정
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{n(picked.length)}명을 {owner}에게 배정할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  시트의 &lsquo;담당자&rsquo; 칸이 바뀌고, 상담 내용에 &ldquo;리터치 풀 배정 → {owner.match(/\(([^)]+)\)/)?.[1] ?? owner}&rdquo; 줄이 남습니다. 다음 액션이 비어 있으면 &ldquo;리터치: 이전 문의 재접촉&rdquo;으로 채워집니다.
                  {pickedClosed > 0 && (reopen ? ` 종료된 ${n(pickedClosed)}명은 종료가 해제되어 진행 중으로 돌아옵니다.` : ` 종료된 ${n(pickedClosed)}명은 종료 상태 그대로 담당만 바뀝니다.`)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={() => void run("one")}>배정</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8" disabled={busy}>
                균등 배분
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{n(picked.length)}명을 영업에게 균등하게 나눠 배정할까요?</AlertDialogTitle>
                <AlertDialogDescription>지금 맡은 건수가 적은 영업부터 번갈아 배정합니다. 시트의 &lsquo;담당자&rsquo; 칸이 바뀌고 상담 내용에 리터치 줄이 남습니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={() => void run("split")}>균등 배분</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {pickedClosed > 0 && (
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={reopen} onCheckedChange={(v) => setReopen(v === true)} aria-label="종료 해제하고 배정" />
              종료된 {n(pickedClosed)}명은 종료를 해제하고 배정
            </label>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v === true)} aria-label={`조건에 맞는 ${n(rows.length)}명 전체 선택`} />
              </TableHead>
              <TableHead className="w-28">문의일</TableHead>
              <TableHead>상호명</TableHead>
              <TableHead className="w-28">서비스</TableHead>
              <TableHead className="w-32">담당</TableHead>
              <TableHead className="w-24">경과</TableHead>
              <TableHead className="w-32">상태</TableHead>
              <TableHead className="w-28">리터치 문구</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  조건에 맞는 고객이 없습니다. 조건을 넓혀 보세요.
                </TableCell>
              </TableRow>
            ) : (
              view.map((r) => {
                const c = r.customer;
                return (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => toggleOne(c.id, v === true)} aria-label={`${c.company} 선택`} />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{formatKst(c.createdAt)}</TableCell>
                    <TableCell>
                      <button type="button" className="text-left text-sm font-medium underline-offset-2 hover:underline" onClick={() => onOpen(c.id)}>
                        {c.company}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">{servicesOf(c).join("·")}</TableCell>
                    <TableCell className="text-xs">{c.owner === UNASSIGNED ? <span className="text-muted-foreground">미배정</span> : c.owner}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {r.ageDays}일 전<span className="block text-[11px] text-muted-foreground">움직임 {r.idleDays}일</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.closed ? <span className="text-amber-700">종료{r.reason ? ` · ${r.reason}` : ""}</span> : "진행 중"}
                      {r.probability !== null && <span className="block text-[11px] text-muted-foreground">가능성 {r.probability}%</span>}
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-label={`${c.company} 리터치 문구 복사`} onClick={() => void copy(c.id, retouchMessage(c.company, servicesOf(c).filter((s) => s !== "미분류")))}>
                        <CopyIcon className="size-3" /> {copied === c.id ? "복사됨" : "복사"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <span className="tabular-nums text-muted-foreground">
            {safePage + 1} / {pageCount}
          </span>
          <Button variant="outline" size="icon" className="size-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지">
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지">
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
