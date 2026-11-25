"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowUpRightIcon, CheckIcon, ClipboardCheckIcon, Clock3Icon, PlayIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { executeRoutine, ROUTINES, type AiWeeklyDraft, type AiReportLine, type ReviewStatus, type RoutineId, type RoutineRun } from "@/lib/agent-routines";
import { useCampaigns } from "@/lib/campaign-store";
import { useCustomerStore } from "@/lib/customer-store";
import { formatKst } from "@/lib/format";
import { isAiWeeklyDraft, readRoutineHistory } from "@/lib/routine-history";

const STORAGE_KEY = "core-sales-agent-routines-v1";
const REVIEW_LABEL: Record<ReviewStatus, string> = { pending: "검토 대기", approved: "검토 완료", needs_changes: "수정 필요" };
const LOCAL_BRIDGE = "http://127.0.0.1:4743";

function AiLines({ title, lines, run }: { title: string; lines: AiReportLine[]; run: RoutineRun }) {
  if (!lines.length) return null;
  return <div className="space-y-2"><h4 className="text-sm font-medium">{title}</h4><ul className="space-y-2 text-sm">{lines.map((line, index) => <li key={`${title}-${index}`} className="rounded-lg bg-muted/40 p-3">
    <p>{line.text}</p><p className="mt-1 text-xs text-muted-foreground">원문: “{line.evidenceQuote}”</p><div className="mt-1 flex flex-wrap gap-2 text-xs">{line.sourceIds.map((id) => { const item = run.items.find((source) => source.id === id); return item ? <Link key={id} href={item.href} className="text-primary underline underline-offset-2">{item.title}{item.sample ? " (샘플)" : ""}</Link> : null; })}</div>
  </li>)}</ul></div>;
}

export default function AgentRoutinesPage() {
  const { customers } = useCustomerStore();
  const { campaigns, hydrated: campaignsReady } = useCampaigns();
  const [runs, setRuns] = React.useState<RoutineRun[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [storageError, setStorageError] = React.useState(false);
  const [bridgeToken, setBridgeToken] = React.useState("");
  const [bridgeStatus, setBridgeStatus] = React.useState("연결 전");
  const [bridgeModel, setBridgeModel] = React.useState<string | null>(null);
  const [bridgeBusy, setBridgeBusy] = React.useState(false);
  const [generatingId, setGeneratingId] = React.useState<string | null>(null);
  const [historyDamaged, setHistoryDamaged] = React.useState(false);
  const originalHistory = React.useRef("");
  const generation = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    let raw: string | null = null;
    let readFailed = false;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { readFailed = true; }
    originalHistory.current = raw || "";
    const saved = readRoutineHistory(raw);
    // localStorage hydration is a one-time browser-only state transfer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRuns(saved.runs);
    setStorageError(readFailed);
    setHistoryDamaged(saved.damaged);
    setSelectedId(saved.runs[0]?.id ?? null);
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || historyDamaged) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    } catch {
      // Show a persistent failure instead of pretending that the review was saved.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError(true);
    }
  }, [runs, hydrated, historyDamaged]);
  React.useEffect(() => () => generation.current?.abort(), []);

  const selected = runs.find((run) => run.id === selectedId) ?? null;
  const ready = hydrated && campaignsReady;

  function runRoutine(id: RoutineId) {
    const result = executeRoutine(id, customers, campaigns);
    setRuns((previous) => [result, ...previous]);
    setSelectedId(result.id);
  }

  function updateReview(id: string, patch: Partial<Pick<RoutineRun, "review" | "reviewNote" | "reviewedAt">>) {
    setRuns((previous) => previous.map((run) => run.id === id ? { ...run, ...patch } : run));
  }

  async function bridgeRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!bridgeToken.trim()) throw new Error("로컬 연결 코드를 입력해 주세요.");
    let response: Response;
    try {
      response = await fetch(new Request(`${LOCAL_BRIDGE}${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${bridgeToken.trim()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal || AbortSignal.timeout(8000),
        targetAddressSpace: "loopback",
      } as RequestInit));
    } catch (error) {
      if (signal?.aborted) throw new DOMException("요청을 중지했습니다.", "AbortError");
      if (error instanceof Error && error.name === "TimeoutError") throw new Error("연결 확인 시간이 초과됐습니다. 연결 서비스를 확인하세요.");
      throw new Error("로컬 연결 서비스가 꺼져 있거나 브라우저의 로컬 네트워크 권한이 차단되었습니다.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `연결 오류 (HTTP ${response.status})`);
    return data as T;
  }

  async function checkBridge() {
    setBridgeBusy(true);
    try {
      const result = await bridgeRequest<{ model: string }>("/status");
      if (typeof result.model !== "string" || !result.model) throw new Error("연결 서비스가 모델 정보를 반환하지 않았습니다.");
      setBridgeModel(result.model);
      setBridgeStatus(`연결됨 · ${result.model}`);
    } catch (error) {
      setBridgeModel(null);
      setBridgeStatus(error instanceof Error ? error.message : "연결하지 못했습니다.");
    } finally { setBridgeBusy(false); }
  }

  async function generateAiDraft(run: RoutineRun) {
    if (generation.current) return;
    const controller = new AbortController();
    generation.current = controller;
    setGeneratingId(run.id);
    setBridgeBusy(true);
    setBridgeStatus("DeepSeek가 원문을 분류하고 있습니다. 최대 3분 정도 걸릴 수 있어요.");
    try {
      const draft = await bridgeRequest<AiWeeklyDraft>("/generate", {
        routineId: run.routineId,
        items: run.items.map(({ id, title, detail, sample, evidence }) => ({ id, title, detail, sample, evidence })),
      }, AbortSignal.any([controller.signal, AbortSignal.timeout(190000)]));
      if (!isAiWeeklyDraft(draft)) throw new Error("보고 초안 형식을 확인하지 못했습니다. 기존 초안은 유지됩니다.");
      setRuns((previous) => previous.map((item) => item.id === run.id ? {
        ...item, aiDraft: draft, review: "pending", reviewNote: "", reviewedAt: undefined,
      } : item));
      setBridgeModel(draft.model);
      setBridgeStatus(`연결됨 · ${draft.model}`);
    } catch (error) {
      setBridgeStatus(error instanceof Error && error.name === "AbortError" ? "작성을 중지했습니다. 기존 초안은 유지됩니다." : error instanceof Error ? error.message : "초안을 만들지 못했습니다.");
    } finally { generation.current = null; setGeneratingId(null); setBridgeBusy(false); }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">에이전트 루틴</h1>
        <p className="text-sm text-muted-foreground">반복 점검을 직접 실행하고 결과를 검토합니다. 실행은 원본 데이터를 바꾸지 않습니다.</p>
      </div>

      <div role="note" className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        결과와 검토 기록은 현재 브라우저에만 저장됩니다. 고객사와 캠페인에 포함된 예시 데이터는 결과에 ‘샘플’로 표시합니다. 예약 실행과 메시지 발송은 아직 연결되지 않았습니다.
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="로컬 DeepSeek 연결">
        <div className="flex flex-wrap items-center gap-2"><SparklesIcon className="size-4 text-primary" /><h2 className="text-sm font-semibold">로컬 DeepSeek</h2><Badge variant="outline">내 PC에서만 사용</Badge></div>
        <p className="text-xs leading-relaxed text-muted-foreground">LM Studio에서 DeepSeek 모델을 로드하고 로컬 연결 서비스를 실행한 뒤, 서비스에 표시된 연결 코드를 입력하세요. 브라우저가 로컬 네트워크 접근을 요청하면 허용해야 합니다. 모델 생성 요청은 이 PC에서 처리됩니다.</p>
        <div className="flex flex-wrap items-center gap-2"><input type="password" autoComplete="off" aria-label="로컬 연결 코드" placeholder="로컬 연결 코드" value={bridgeToken} disabled={bridgeBusy} onChange={(event) => { setBridgeToken(event.target.value); setBridgeModel(null); setBridgeStatus("연결 전"); }} className="h-9 min-w-0 basis-48 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" /><Button type="button" size="sm" variant="outline" disabled={bridgeBusy || !bridgeToken.trim()} onClick={checkBridge}>{bridgeBusy && !generatingId ? "확인 중…" : "연결 확인"}</Button>{generatingId && <Button type="button" size="sm" variant="outline" onClick={() => generation.current?.abort()}>작성 중지</Button>}</div>
        <p role="status" className={`text-xs ${bridgeModel ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>{bridgeStatus}</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {ROUTINES.map((routine) => {
          const latest = runs.find((run) => run.routineId === routine.id);
          return (
            <Card key={routine.id} className="shadow-xs">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold">{routine.title}</h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">{routine.description}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground">{latest ? `마지막 실행 ${formatKst(latest.runAt)}` : "실행 기록 없음"}</span>
                  <Button size="sm" disabled={!ready} onClick={() => runRoutine(routine.id)}>
                    {latest ? <RotateCcwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                    {latest ? "다시 실행" : "실행"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {storageError && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircleIcon className="size-4" /> 브라우저 저장소에 기록을 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요.</p>}
      {historyDamaged && <div role="alert" className="space-y-2 rounded-xl border border-amber-300 p-4 text-sm"><p>저장된 이력 일부를 읽지 못해 자동 저장을 멈췄습니다. 원본은 그대로 보존되며, 이번 실행은 새로고침하면 사라집니다.</p><Button size="sm" variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([originalHistory.current], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "routine-history-recovery.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>원본 이력 내려받기</Button></div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <section className="space-y-3" aria-labelledby="routine-history-title">
          <div className="flex items-center justify-between">
            <h2 id="routine-history-title" className="text-base font-semibold">실행 이력</h2>
            <span className="text-xs text-muted-foreground">{runs.length}건</span>
          </div>
          {!ready ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">기록을 불러오는 중…</p> : runs.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">아직 실행 기록이 없습니다. 위에서 루틴을 실행해 주세요.</p>
          ) : (
            <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
              {runs.map((run) => (
                <button key={run.id} type="button" onClick={() => setSelectedId(run.id)} aria-current={selectedId === run.id ? "true" : undefined}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === run.id ? "border-primary bg-primary/5" : "bg-card"}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium">{ROUTINES.find((routine) => routine.id === run.routineId)?.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{run.status === "failed" ? "실패" : run.status === "empty" ? "결과 없음" : `${run.items.length}건`}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Clock3Icon className="size-3" /> {formatKst(run.runAt)} · {REVIEW_LABEL[run.review] ?? "검토 대기"}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="routine-result-title" className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="routine-result-title" className="text-base font-semibold">실행 결과</h2>
          {!selected ? <p className="text-sm text-muted-foreground">왼쪽에서 이력을 선택하거나 새로 실행해 주세요.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{ROUTINES.find((routine) => routine.id === selected.routineId)?.title}</span>
                <Badge variant="outline">{selected.status === "failed" ? "실패" : selected.status === "empty" ? "결과 없음" : "실행 완료"}</Badge>
                {selected.sampleCount > 0 && <Badge variant="secondary">샘플 {selected.sampleCount}건 포함</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">실행 {formatKst(selected.runAt)} · 기준 {selected.basis || "입력 데이터 확인 실패"}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.summary}</p>
              {selected.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">오류: {selected.error}</p>}
              {selected.items.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-medium">관련 기록 {selected.items.length}건</h3>
                  <div className="max-h-72 divide-y overflow-auto rounded-lg border">
                    {selected.items.map((item) => (
                      <Link key={item.id} href={item.href} className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-medium">{item.title}{item.sample && <Badge variant="secondary" className="text-[10px]">샘플</Badge>}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span></span>
                        <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {selected.routineId === "weekly" && selected.status === "success" && <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">DeepSeek 주간 보고 초안</h3><p className="text-xs text-muted-foreground">고객사 활동의 원문을 분류한 초안입니다. 원본과 비교해 검토해 주세요.</p></div><Button size="sm" disabled={bridgeBusy || !bridgeModel || !selected.items.some((item) => item.evidence?.length)} onClick={() => generateAiDraft(selected)}><SparklesIcon className="size-3.5" />{generatingId === selected.id ? "초안 작성 중…" : selected.aiDraft ? "초안 다시 작성" : "DeepSeek로 초안 작성"}</Button></div>
                {!selected.items.some((item) => item.evidence?.length) && <p className="text-xs text-muted-foreground">이전 실행 기록에는 활동 원문이 없습니다. 주간 보고 루틴을 다시 실행해 주세요.</p>}
                {selected.aiDraft && <div className="space-y-4 rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">{selected.aiDraft.model} · {formatKst(selected.aiDraft.generatedAt)} · AI 작성 내용은 검토 전 초안입니다.</p>
                  {selected.aiDraft.coverage && <p className="text-xs leading-relaxed text-muted-foreground">전체 {selected.aiDraft.coverage.totalSources}곳 중 {selected.aiDraft.coverage.includedSources}곳 · 활동 {selected.aiDraft.coverage.totalEvidence}개 중 {selected.aiDraft.coverage.includedEvidence}개 참고{selected.aiDraft.coverage.clipped ? " · 모델 문맥 제한으로 일부 자료를 줄였습니다. 전체 내용은 관련 기록에서 확인하세요." : ""}</p>}
                  <AiLines title="요약" lines={selected.aiDraft.summary} run={selected} />
                  <AiLines title="우선순위" lines={selected.aiDraft.priorities} run={selected} />
                  <AiLines title="다음 액션" lines={selected.aiDraft.nextActions} run={selected} />
                  {selected.aiDraft.needsVerification.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"><h4 className="font-medium">근거 확인 필요</h4><ul className="mt-1 list-disc pl-5">{selected.aiDraft.needsVerification.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
                </div>}
              </div>}
              <div className="space-y-3 border-t pt-4">
                <h3 className="flex items-center gap-2 text-sm font-medium"><ClipboardCheckIcon className="size-4" /> 검토</h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={generatingId === selected.id} variant={selected.review === "approved" ? "default" : "outline"} aria-pressed={selected.review === "approved"}
                    onClick={() => updateReview(selected.id, { review: "approved", reviewedAt: new Date().toISOString() })}><CheckIcon className="size-3.5" /> 검토 완료</Button>
                  <Button size="sm" disabled={generatingId === selected.id} variant={selected.review === "needs_changes" ? "default" : "outline"} aria-pressed={selected.review === "needs_changes"}
                    onClick={() => updateReview(selected.id, { review: "needs_changes", reviewedAt: new Date().toISOString() })}>수정 필요</Button>
                </div>
                <div className="space-y-1.5"><Label htmlFor="routine-review-note">검토 메모</Label><Textarea id="routine-review-note" rows={3} maxLength={2000} disabled={generatingId === selected.id} value={selected.reviewNote ?? ""} onChange={(event) => updateReview(selected.id, { reviewNote: event.target.value })} placeholder="확인한 내용이나 수정할 점을 적어 주세요" /></div>
                {selected.reviewedAt && <p className="text-xs text-muted-foreground">{REVIEW_LABEL[selected.review]} · {formatKst(selected.reviewedAt)}</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
