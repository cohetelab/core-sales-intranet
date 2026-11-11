"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInfluencerGroupStore } from "@/lib/influencer-group-store";
import { useInfluencerStore } from "@/lib/influencer-store";
import {
  DEFAULT_MATCH_PLAYBOOK,
  normalizeMatchPlaybook,
  runMatchPlaybook,
  validateMatchPlaybook,
  type MatchPlaybook,
  type MatchRun,
} from "@/lib/match-playbook";

const PLAYBOOK_KEY = "core-sales-match-playbook-v1";
const RUNS_KEY = "core-sales-match-runs-v1";
const MAX_RUNS = 30;

function loadPlaybook(): MatchPlaybook {
  try {
    return normalizeMatchPlaybook(JSON.parse(window.localStorage.getItem(PLAYBOOK_KEY) ?? "null"));
  } catch {
    return DEFAULT_MATCH_PLAYBOOK;
  }
}

function loadRuns(): MatchRun[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RUNS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MatchRun =>
      item && typeof item === "object" && typeof item.id === "string" &&
      typeof item.brief === "string" && Array.isArray(item.results) && Array.isArray(item.failures)
    ).slice(0, MAX_RUNS);
  } catch {
    return [];
  }
}

const numberValue = (raw: string) => raw === "" ? 0 : Number(raw);
const dateLabel = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
};

export function MatcherWorkflow() {
  const { influencers } = useInfluencerStore();
  const { groups, addMember } = useInfluencerGroupStore();
  const [hydrated, setHydrated] = React.useState(false);
  const [playbook, setPlaybook] = React.useState<MatchPlaybook>(DEFAULT_MATCH_PLAYBOOK);
  const [draft, setDraft] = React.useState<MatchPlaybook>(DEFAULT_MATCH_PLAYBOOK);
  const [exclusionsText, setExclusionsText] = React.useState("");
  const [runs, setRuns] = React.useState<MatchRun[]>([]);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [brief, setBrief] = React.useState("");
  const [groupId, setGroupId] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    const savedPlaybook = loadPlaybook();
    const savedRuns = loadRuns();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaybook(savedPlaybook);
    setDraft(savedPlaybook);
    setExclusionsText(savedPlaybook.excludedCategories.join(", "));
    setRuns(savedRuns);
    setActiveRunId(savedRuns[0]?.id ?? null);
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PLAYBOOK_KEY, JSON.stringify(playbook));
      window.localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
    } catch {
      // Browser storage may be disabled; the current session still works.
    }
  }, [hydrated, playbook, runs]);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;
  const activeGroups = groups.filter((group) => !group.archivedAt);
  const selectedGroup = activeGroups.find((group) => group.id === groupId);
  const effectiveGroupId = selectedGroup?.id ?? "";
  const dirty = JSON.stringify(draft) !== JSON.stringify(playbook);
  const draftError = validateMatchPlaybook(draft);

  function updateDraft<K extends keyof MatchPlaybook>(key: K, value: MatchPlaybook[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError("");
    setNotice("");
  }

  function savePlaybook() {
    const problem = validateMatchPlaybook(draft);
    if (problem) { setError(problem); return; }
    const normalized = normalizeMatchPlaybook(draft);
    const saved = { ...normalized, version: playbook.version + 1 };
    setPlaybook(saved);
    setDraft(saved);
    setExclusionsText(saved.excludedCategories.join(", "));
    setError("");
    setNotice(`매뉴얼을 v${saved.version}로 저장했습니다.`);
  }

  function run() {
    if (!brief.trim()) return;
    if (dirty) { setError("수정 중인 매뉴얼을 저장한 뒤 실행해 주세요."); return; }
    const next = runMatchPlaybook(brief, influencers, playbook);
    setRuns((prev) => [next, ...prev].slice(0, MAX_RUNS));
    setActiveRunId(next.id);
    setError("");
    setNotice("");
  }

  function updateFeedback(runId: string, creatorId: string, feedback: string) {
    setRuns((prev) => prev.map((run) => run.id === runId ? {
      ...run,
      results: run.results.map((result) => result.creatorId === creatorId ? { ...result, feedback } : result),
    } : run));
  }

  function addToGroup(creatorId: string) {
    if (!effectiveGroupId) { setError("샘플 리스트 그룹을 먼저 선택해 주세요."); return; }
    addMember(effectiveGroupId, creatorId);
    setError("");
    setNotice(`선택한 크리에이터를 ${selectedGroup?.name}에 담았습니다. 명단 확정과 링크 발행은 샘플 리스트 전달 화면에서 진행하세요.`);
  }

  if (!hydrated) return <p className="text-sm text-muted-foreground">매칭 매뉴얼과 실행 기록을 불러오는 중…</p>;

  return <div className="space-y-7">
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">브리프를 매뉴얼 기준으로 매칭하고 결과를 검증합니다. 매뉴얼·실행 기록·샘플 그룹은 현재 브라우저에만 저장됩니다. 추천은 규칙 기반이며 실제 계정 지표를 자동 수집하지 않습니다.</p>

    <section className="space-y-4 rounded-2xl border p-4 sm:p-5" aria-labelledby="match-playbook-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 id="match-playbook-title" className="font-semibold">매칭 업무 매뉴얼 <span className="font-normal text-muted-foreground">v{playbook.version}</span></h3><p className="text-xs text-muted-foreground">저장된 기준으로만 실행합니다. 수정 후 저장하면 버전이 올라갑니다.</p></div>
        <Button type="button" size="sm" onClick={savePlaybook} disabled={!dirty || Boolean(draftError)}>매뉴얼 저장</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="match-count">추천 인원</Label><Input id="match-count" type="number" min={1} max={50} value={draft.maxResults} onChange={(event) => updateDraft("maxResults", numberValue(event.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="match-min-followers">최소 팔로워</Label><Input id="match-min-followers" type="number" min={0} value={draft.minFollowers} onChange={(event) => updateDraft("minFollowers", numberValue(event.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="match-max-followers">최대 팔로워 <span className="font-normal text-muted-foreground">(0은 제한 없음)</span></Label><Input id="match-max-followers" type="number" min={0} value={draft.maxFollowers} onChange={(event) => updateDraft("maxFollowers", numberValue(event.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="match-min-er">최소 참여율 (%)</Label><Input id="match-min-er" type="number" min={0} max={100} step="0.1" value={draft.minEngagementRate} onChange={(event) => updateDraft("minEngagementRate", numberValue(event.target.value))} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="match-exclusions">제외 카테고리</Label><Input id="match-exclusions" value={exclusionsText} onChange={(event) => { const text = event.target.value; setExclusionsText(text); updateDraft("excludedCategories", text.split(",").map((value) => value.trim()).filter(Boolean)); }} placeholder="예: 패션, 게임" /><p className="text-xs text-muted-foreground">쉼표로 구분합니다. 카테고리 이름에 해당 단어가 포함되면 제외합니다.</p></div>
      {draftError && <p role="alert" className="text-sm text-destructive">{draftError}</p>}
    </section>

    <section className="space-y-3" aria-labelledby="match-run-title">
      <div><h3 id="match-run-title" className="font-semibold">매칭 실행</h3><p className="text-xs text-muted-foreground">카테고리·소개글·핸들의 브리프 키워드 일치를 근거로 추천합니다.</p></div>
      <div className="space-y-1.5"><Label htmlFor="brief">브리프</Label><Textarea id="brief" rows={3} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="예: 20~30대 여성 타깃 클린뷰티 스킨케어 신제품, 솔직한 리뷰 콘텐츠" /></div>
      <Button type="button" onClick={run} disabled={!brief.trim() || dirty}><PlayIcon className="size-3.5" /> 매뉴얼 v{playbook.version}으로 실행</Button>
      {dirty && <p className="text-xs text-muted-foreground">매뉴얼 수정 내용을 저장하면 실행할 수 있습니다.</p>}
    </section>

    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}

    {activeRun && <section className="space-y-4" aria-labelledby="match-results-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 id="match-results-title" className="font-semibold">추천 결과 {activeRun.results.length}명</h3><p className="text-xs text-muted-foreground">{dateLabel(activeRun.createdAt)} · 매뉴얼 v{activeRun.playbook.version} · {activeRun.failures.length || activeRun.results.some((result) => result.failures.length || result.feedback.trim()) ? "확인 필요" : "자동 검증 통과"}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => { setBrief(activeRun.brief); setNotice("이전 브리프를 불러왔습니다. 현재 매뉴얼로 다시 실행할 수 있습니다."); }}><RotateCcwIcon className="size-3.5" /> 이 브리프로 다시 실행</Button>
      </div>
      {activeRun.failures.map((failure) => <p key={failure} role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{failure}. 매뉴얼 조건이나 브리프를 확인해 주세요.</p>)}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 space-y-1.5"><Label htmlFor="match-group">담을 샘플 리스트 그룹</Label><select id="match-group" value={effectiveGroupId} onChange={(event) => setGroupId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">그룹 선택</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.memberIds.length}명)</option>)}</select></div>
        <Button asChild variant="outline" size="sm"><Link href="/sample-lists">샘플 리스트 만들기 <ArrowRightIcon className="size-3.5" /></Link></Button>
      </div>
      <ul className="divide-y rounded-xl border">
        {activeRun.results.map((result) => {
          const current = influencers.find((creator) => creator.id === result.creatorId);
          const alreadyAdded = selectedGroup?.memberIds.includes(result.creatorId) ?? false;
          return <li key={result.creatorId} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1"><p className="font-medium">@{result.handle}</p><p className="text-xs text-muted-foreground">팔로워 {result.followers.toLocaleString("ko-KR")}명 · 참여율 {result.engagementRate}% · {result.categories.join(", ")}</p><p className="mt-1 text-sm">근거: {result.reasons.length ? result.reasons.join(", ") : "없음"}</p></div>
              <Button type="button" size="sm" variant={alreadyAdded ? "outline" : "default"} disabled={!effectiveGroupId || alreadyAdded || !current || result.failures.length > 0 || Boolean(result.feedback.trim())} onClick={() => addToGroup(result.creatorId)}>{alreadyAdded ? <><CheckIcon className="size-3.5" /> 담김</> : "그룹에 추가"}</Button>
            </div>
            {result.failures.length ? <p className="text-xs text-amber-800">검증 실패: {result.failures.join(", ")}</p> : <p className="text-xs text-emerald-700">자동 검증 통과</p>}
            <div className="max-w-xl space-y-1"><Label htmlFor={`feedback-${activeRun.id}-${result.creatorId}`} className="text-xs">부적합한 추천인가요? 이유 기록</Label><Input id={`feedback-${activeRun.id}-${result.creatorId}`} value={result.feedback} onChange={(event) => updateFeedback(activeRun.id, result.creatorId, event.target.value)} placeholder="예: 캠페인 톤과 맞지 않음" /></div>
          </li>;
        })}
      </ul>
      <Button asChild variant="outline" size="sm"><Link href={effectiveGroupId ? `/sample-lists?group=${encodeURIComponent(effectiveGroupId)}` : "/sample-lists"}>샘플 리스트 전달 화면으로 <ArrowRightIcon className="size-3.5" /></Link></Button>
    </section>}

    <section className="space-y-2 border-t pt-5" aria-labelledby="match-history-title">
      <h3 id="match-history-title" className="font-semibold">실행 기록 <span className="font-normal text-muted-foreground">{runs.length}건</span></h3>
      {runs.length === 0 ? <p className="text-sm text-muted-foreground">아직 실행 기록이 없습니다.</p> : <div className="max-h-64 divide-y overflow-auto rounded-xl border">{runs.map((run) => <button key={run.id} type="button" onClick={() => { setActiveRunId(run.id); setNotice(""); }} aria-current={activeRunId === run.id ? "true" : undefined} className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeRunId === run.id ? "bg-primary/5" : ""}`}><span className="min-w-0 truncate">{run.brief}</span><span className="shrink-0 text-xs text-muted-foreground">v{run.playbook.version} · {run.results.length}명 · {dateLabel(run.createdAt)}</span></button>)}</div>}
      <p className="text-xs text-muted-foreground">최근 {MAX_RUNS}건까지만 이 브라우저에 보관합니다. 기록은 다른 기기와 공유되지 않습니다.</p>
    </section>
  </div>;
}
