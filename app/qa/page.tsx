"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRightIcon, CheckIcon, CircleAlertIcon, Clock3Icon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const ROUTES = [
  { name: "대시보드", path: "/" },
  { name: "리드 인박스", path: "/leads" },
  { name: "고객사", path: "/customers" },
  { name: "크리에이터 탐색", path: "/creator-search" },
  { name: "샘플 리스트", path: "/sample-lists" },
  { name: "캠페인", path: "/campaigns" },
  { name: "정산", path: "/creator-settlements" },
  { name: "에이전트 루틴", path: "/agents/routines" },
  { name: "팀 지식창고", path: "/knowledge" },
] as const;

const CHECKLIST = [
  { id: "navigation", title: "메뉴 이동", detail: "사이드바와 통합 검색으로 원하는 화면에 이동한다." },
  { id: "lead", title: "리드 검색", detail: "검색·필터 후 고객사를 열어 실제 내용이 보이는지 확인한다." },
  { id: "creator", title: "크리에이터 탐색", detail: "검색·선택·그룹 추가 후 목록에 반영되는지 확인한다." },
  { id: "sample", title: "샘플 리스트 전달", detail: "명단 확정과 전달용 링크를 열어 내용을 확인한다." },
  { id: "settlement", title: "정산 기록", detail: "정산 상태와 결과 URL이 저장 후 다시 표시되는지 확인한다." },
  { id: "mobile", title: "모바일 화면", detail: "작은 화면에서 메뉴와 주요 버튼을 사용할 수 있는지 확인한다." },
] as const;

type RouteResult = { status: "ok" | "error"; code?: number; durationMs: number; message?: string };
type QaRecord = { checked: Record<string, boolean>; note: string; updatedAt: string | null };
const STORAGE_KEY = "core-sales-intranet-qa-v1";

function loadRecord(): QaRecord {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<QaRecord> | null;
    if (value && typeof value === "object") {
      return {
        checked: value.checked && typeof value.checked === "object" ? value.checked : {},
        note: typeof value.note === "string" ? value.note : "",
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      };
    }
  } catch { /* Corrupt local data starts a fresh checklist. */ }
  return { checked: {}, note: "", updatedAt: null };
}

export default function QaPage() {
  const [record, setRecord] = React.useState<QaRecord>({ checked: {}, note: "", updatedAt: null });
  const [hydrated, setHydrated] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, RouteResult>>({});
  const [running, setRunning] = React.useState(false);
  const [ranAt, setRanAt] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState(false);

  React.useEffect(() => {
    // localStorage is only available after the browser mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(loadRecord());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveError(true);
    }
  }, [record, hydrated]);

  async function runChecks() {
    if (running) return;
    setRunning(true);
    setResults({});
    const entries = await Promise.all(ROUTES.map(async ({ path }): Promise<[string, RouteResult]> => {
      const started = performance.now();
      try {
        const response = await fetch(path, {
          method: "HEAD",
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(10000),
        });
        return [path, {
          status: response.ok ? "ok" : "error",
          code: response.status,
          durationMs: Math.round(performance.now() - started),
        }];
      } catch (error) {
        return [path, {
          status: "error",
          durationMs: Math.round(performance.now() - started),
          message: error instanceof Error && error.name === "TimeoutError" ? "응답 시간 초과" : "연결 실패",
        }];
      }
    }));
    setResults(Object.fromEntries(entries));
    setRanAt(new Date().toISOString());
    setRunning(false);
  }

  function updateRecord(patch: Partial<QaRecord>) {
    setRecord((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    setSaveError(false);
  }

  const okCount = Object.values(results).filter((result) => result.status === "ok").length;
  const checkedCount = CHECKLIST.filter(({ id }) => record.checked[id]).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">인트라넷 QA</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">주요 화면의 응답을 확인하고, 실제 업무 흐름을 직접 점검한 내용을 기록합니다.</p>
        </div>
        <Button type="button" size="lg" disabled={running} onClick={runChecks}>
          {running ? <RotateCcwIcon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
          {running ? "확인 중" : "화면 응답 확인"}
        </Button>
      </header>

      <section aria-labelledby="route-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="route-heading" className="text-base font-semibold">주요 화면 응답</h2>
            <p className="mt-1 text-xs text-muted-foreground">현재 브라우저에서 각 경로의 HTTP 상태만 확인합니다. 화면 내용과 버튼 동작은 아래 체크리스트로 확인하세요.</p>
          </div>
          <p role="status" className="text-sm tabular-nums text-muted-foreground">
            {ranAt ? `${okCount}/${ROUTES.length} 응답 성공 · ${new Date(ranAt).toLocaleString("ko-KR")}` : "아직 확인하지 않음"}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="divide-y">
            {ROUTES.map(({ name, path }) => {
              const result = results[path];
              return <div key={path} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{path}</p>
                </div>
                <span className={`text-xs tabular-nums sm:text-right ${result?.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : result?.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                  {result ? result.message ?? `${result.code} · ${result.durationMs}ms` : running ? "확인 중" : "대기"}
                </span>
                <Button asChild variant="ghost" size="icon-sm" aria-label={`${name} 열기`}><Link href={path}><ArrowUpRightIcon className="size-4" /></Link></Button>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="manual-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="manual-heading" className="text-base font-semibold">업무 흐름 확인</h2>
            <p className="mt-1 text-xs text-muted-foreground">직접 확인한 항목만 체크하세요. 기록은 이 브라우저에 저장됩니다.</p>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{checkedCount}/{CHECKLIST.length} 확인</span>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          {CHECKLIST.map(({ id, title, detail }) => <label key={id} className="flex cursor-pointer items-start gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40">
            <input type="checkbox" checked={Boolean(record.checked[id])} disabled={!hydrated} onChange={(event) => updateRecord({ checked: { ...record.checked, [id]: event.target.checked } })} className="mt-1 size-4 accent-primary" />
            <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="block text-xs leading-5 text-muted-foreground">{detail}</span></span>
            {record.checked[id] && <CheckIcon className="ml-auto size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />}
          </label>)}
        </div>
        <div className="space-y-2">
          <label htmlFor="qa-note" className="text-sm font-medium">발견한 문제·재현 방법</label>
          <textarea id="qa-note" value={record.note} disabled={!hydrated} onChange={(event) => updateRecord({ note: event.target.value })} placeholder="어느 화면에서 무엇을 눌렀고, 어떤 결과가 나왔는지 적어주세요." className="min-h-28 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {saveError ? <><CircleAlertIcon className="size-3.5" /> 브라우저에 저장하지 못했습니다. 내용을 복사해 보관하세요.</> : <><Clock3Icon className="size-3.5" /> {record.updatedAt ? `마지막 기록 ${new Date(record.updatedAt).toLocaleString("ko-KR")}` : "입력하면 자동 저장됩니다."}</>}
          </p>
        </div>
      </section>
    </main>
  );
}
