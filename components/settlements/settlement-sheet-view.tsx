"use client";

import * as React from "react";
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, LockIcon, RefreshCw, SearchIcon } from "lucide-react";

import { SheetLoginCard } from "@/components/leads/sheet-login-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { won } from "@/lib/lead-target";
import { isPaidRow, payoutOf, totalsOf, type SettlementRow, type Warning } from "@/lib/settlement-parse";
import { cn } from "@/lib/utils";

// 정산 시트: 구글 정산 시트(광고주·인플루언서별 지급액과 결제 현황)를 읽어서 보여 준다. 읽기 전용이고 시트를 바꾸지 않는다.
// 인플루언서별 지급액과 광고주 계약 매출이 들어 있어서 관리자만 볼 수 있다(서버가 막는다).

type Snapshot = {
  rows: SettlementRow[];
  warnings: Warning[];
  skipped: { blank: number; summary: number };
  header: { row: number; missing: string[] };
  fetchedAt: string;
  sheetUrl: string;
  sheetName: string;
};
type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "admin_only" }
  | { kind: "setup" }
  | { kind: "error"; text: string }
  | { kind: "ready"; data: Snapshot };

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "정산 시트 연결 토큰이 맞지 않습니다(Vercel의 SETTLEMENT_SCRIPT_TOKEN과 Apps Script의 BRIDGE_TOKEN이 같은지 확인하세요)",
  unreachable: "정산 시트 서버에 연결하지 못했습니다",
  upstream: "정산 시트 서버가 오류를 돌려줬습니다",
  bad_response: "정산 시트 서버가 데이터를 돌려주지 않았습니다 — 웹 앱 배포의 액세스가 '모든 사용자'인지, 주소가 /exec 로 끝나는지 확인하세요",
  server_error: "정산 시트 스크립트에서 오류가 났습니다",
  too_many_rows: "정산 시트가 너무 큽니다(2만 행 이하만 읽습니다)",
  no_header: "정산 시트에서 열 제목 행(인플루언서명 · 결제 여부)을 찾지 못했습니다",
  empty_sheet: "정산 시트가 비어 있습니다",
};

const PAGE_SIZE = 50;
const n = (v: number) => v.toLocaleString("ko-KR");
const money = (v: number | null) => (v === null ? <span className="text-muted-foreground">-</span> : won(v));
const STATUS_LABEL = { paid: "결제 완료", waiting: "결제 대기", refund: "환불", unset: "미기재", other: "기타" } as const;

type StatusFilter = "all" | "paid" | "unpaid" | "refund";

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} aria-label={label} className="h-7 rounded-full px-2.5 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

function SetupGuide() {
  return (
    <Card className="mx-auto w-full max-w-2xl shadow-xs">
      <CardContent className="space-y-3 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <LockIcon className="size-4 text-muted-foreground" /> 정산 시트 연결이 아직 설정되지 않았습니다
        </h2>
        <p className="text-muted-foreground">
          정산 시트를 읽으려면 구글 Apps Script 다리를 만들고 Vercel 환경변수 두 개를 넣어야 합니다. 값은 직접 입력해 주세요(채팅이나 저장소에 적지 않습니다).
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Apps Script 프로젝트에 <code className="rounded bg-muted px-1">integrations/settlement-bridge/Code.gs</code> 를 붙이고 스크립트 속성 <code className="rounded bg-muted px-1">BRIDGE_SPREADSHEET_ID</code> 를 설정합니다.</li>
          <li><code className="rounded bg-muted px-1">setupToken</code> 함수를 한 번 실행해 로그에 나온 토큰을 복사합니다.</li>
          <li>웹 앱으로 배포(액세스: 모든 사용자)하고 <code className="rounded bg-muted px-1">/exec</code> 주소를 복사합니다.</li>
          <li>Vercel 환경변수 <code className="rounded bg-muted px-1">SETTLEMENT_SCRIPT_URL</code>(주소)과 <code className="rounded bg-muted px-1">SETTLEMENT_SCRIPT_TOKEN</code>(토큰)을 추가하고 다시 배포합니다.</li>
        </ol>
        <p className="text-xs text-muted-foreground">자세한 순서는 저장소의 <code className="rounded bg-muted px-1">integrations/settlement-bridge/README.md</code> 에 있습니다.</p>
      </CardContent>
    </Card>
  );
}

export function SettlementSheetView() {
  const [state, setState] = React.useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [source, setSource] = React.useState("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);

  const load = React.useCallback(async (fresh: boolean) => {
    try {
      const res = await fetch(fresh ? "/api/leads/settlement?fresh=1" : "/api/leads/settlement", { cache: "no-store" });
      if (res.status === 401) return setState({ kind: "login" });
      if (res.status === 403) return setState({ kind: "admin_only" });
      const data = (await res.json().catch(() => ({}))) as Partial<Snapshot> & { error?: string; code?: string; detail?: string };
      if (res.status === 503) return setState(data.error === "settlement_not_configured" ? { kind: "setup" } : { kind: "error", text: "시트 연동(리드 화면)이 설정되지 않았습니다" });
      if (!res.ok || !data.rows) {
        const base = ERROR_TEXT[data.code ?? ""] ?? "정산 시트를 불러오지 못했습니다";
        return setState({ kind: "error", text: `${base}${data.code ? ` (${data.code}${data.detail ? `: ${data.detail}` : ""})` : ""}` });
      }
      setState({ kind: "ready", data: data as Snapshot });
    } catch {
      setState({ kind: "error", text: "서버에 연결하지 못했습니다" });
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [load]);

  const login = React.useCallback(
    async (passcode: string, name: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/leads/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode, name }) });
        if (res.ok) {
          window.dispatchEvent(new Event("core-sales-login")); // 팀 공용 화면 설정 등을 로그인 직후 바로 불러오게 알린다
          setState({ kind: "loading" });
          await load(false);
          return null;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "too_many_attempts") return "여러 번 틀려 잠시 막혔습니다. 잠시 뒤에 다시 시도하세요.";
        return data.error === "unauthorized" ? "비밀번호가 맞지 않습니다." : "로그인하지 못했습니다.";
      } catch {
        return "서버에 연결하지 못했습니다.";
      }
    },
    [load]
  );

  const data = state.kind === "ready" ? state.data : null;
  const rows = React.useMemo(() => data?.rows ?? [], [data]);
  const sources = React.useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))), [rows]);
  const inSource = React.useMemo(() => rows.filter((r) => source === "all" || r.source === source), [rows, source]);
  const totals = React.useMemo(() => totalsOf(inSource), [inSource]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return inSource.filter((r) => {
      if (status === "paid" && !isPaidRow(r)) return false;
      if (status === "unpaid" && (isPaidRow(r) || r.status === "refund")) return false;
      if (status === "refund" && r.status !== "refund") return false;
      return !q || r.creator.toLowerCase().includes(q) || r.advertiser.toLowerCase().includes(q) || r.project.toLowerCase().includes(q);
    });
  }, [inSource, status, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const unpaidAll = totals.unpaidRows;

  if (state.kind === "loading") return <p className="py-10 text-center text-sm text-muted-foreground" role="status">정산 시트를 불러오는 중…</p>;
  if (state.kind === "login") return <SheetLoginCard onLogin={login} />;
  if (state.kind === "setup") return <SetupGuide />;
  if (state.kind === "admin_only") {
    return (
      <Card className="mx-auto w-full max-w-md shadow-xs">
        <CardContent className="space-y-2 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <LockIcon className="size-4 text-muted-foreground" /> 관리자만 볼 수 있습니다
          </h2>
          <p className="text-muted-foreground">정산 시트에는 인플루언서별 지급액과 광고주 계약 매출이 들어 있어서 관리자 계정으로 로그인해야 열립니다.</p>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className="mx-auto flex max-w-2xl items-start justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>{state.text}</span>
        <button type="button" className="shrink-0 underline" onClick={() => { setState({ kind: "loading" }); void load(true); }}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!data) return null;

  const cards = [
    { label: "총 지급액", value: won(totals.payout), sub: `${n(totals.rows - totals.refundRows)}건 · 환불 제외`, tone: "" },
    { label: "결제 완료", value: won(totals.paid), sub: `${n(totals.paidRows)}건`, tone: "text-emerald-700" },
    { label: "미결제", value: won(totals.unpaid), sub: `${n(totals.unpaidRows)}건 · 대기·미기재 포함`, tone: unpaidAll > 0 ? "text-amber-700" : "" },
    { label: "광고주 계약 매출", value: won(totals.revenue), sub: `${n(totals.revenueRows)}건에 금액이 적혀 있음`, tone: "" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          구글 정산 시트에서 읽어 온 값입니다. 이 화면은 읽기만 하고 시트를 바꾸지 않습니다. · 탭 &lsquo;{data.sheetName}&rsquo; · 마지막 확인 {formatDateTime(data.fetchedAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          {data.sheetUrl.startsWith("https://docs.google.com/") && (
            <Button asChild variant="outline" className="h-9 py-2">
              <a href={data.sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-3.5" /> 시트 열기
              </a>
            </Button>
          )}
          <Button variant="outline" className="h-9 py-2" disabled={refreshing} onClick={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> 새로고침
          </Button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <details className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900" aria-label="데이터 확인 필요">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
            <AlertTriangleIcon className="size-4" /> 시트 데이터 확인 필요 {data.warnings.length}종 — 숫자가 실제와 다를 수 있습니다
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.warnings.map((w) => (
              <li key={w.id} data-warning={w.id}>
                {w.text} · <strong>{n(w.count)}행</strong>
                <span className="text-amber-800/80"> (시트 행 {w.rows.join(", ")}{w.count > w.rows.length ? " …" : ""})</span>
              </li>
            ))}
          </ul>
          {data.skipped.blank > 0 && <p className="mt-2">완전히 빈 행 {n(data.skipped.blank)}개는 건너뛰었습니다.</p>}
        </details>
      )}
      {data.header.missing.length > 0 && (
        <p role="note" className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          시트에서 찾지 못한 열: {data.header.missing.join(", ")} — 해당 값은 비어 있게 보입니다.
        </p>
      )}

      <section aria-label="정산 시트 요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-xs">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={cn("text-2xl font-semibold tabular-nums", c.tone)} data-testid={`card-${c.label}`}>
                {c.value}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">
        지급액은 &lsquo;공제 후 금액&rsquo;이 있으면 그 값, 비어 있으면 &lsquo;인플루언서 비용&rsquo;으로 계산합니다(둘 다 없으면 0원). 결제 여부가 비어 있는 행은 미결제로 셉니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="인플루언서·광고주·프로젝트 검색" aria-label="정산 검색" className="h-8 w-64 pl-8 text-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="구분 필터">
          <Chip active={source === "all"} onClick={() => { setSource("all"); setPage(0); }} label="전체 구분">전체 구분</Chip>
          {sources.map((s) => (
            <Chip key={s} active={source === s} onClick={() => { setSource(s); setPage(0); }} label={`구분 ${s}`}>{s}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="결제 상태 필터">
          {([["all", "전체"], ["paid", "결제 완료"], ["unpaid", "미결제"], ["refund", "환불"]] as const).map(([id, label]) => (
            <Chip key={id} active={status === id} onClick={() => { setStatus(id); setPage(0); }} label={`상태 ${label}`}>{label}</Chip>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums" role="status" aria-label="표시 건수">
          표시 {n(filtered.length)}건 · 전체 {n(rows.length)}건
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <Table aria-label="정산 시트 목록">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">구분</TableHead>
              <TableHead>광고주 · 프로젝트</TableHead>
              <TableHead>인플루언서</TableHead>
              <TableHead className="text-right">인플루언서 비용</TableHead>
              <TableHead className="text-right">공제 후 금액</TableHead>
              <TableHead className="text-right">광고주 계약 매출</TableHead>
              <TableHead className="w-20">업로드</TableHead>
              <TableHead className="w-28">결제</TableHead>
              <TableHead className="w-28">결제일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 정산 건이 없습니다.</TableCell>
              </TableRow>
            ) : (
              view.map((r) => (
                <TableRow key={r.row} data-row={r.row}>
                  <TableCell className="text-xs">{r.source || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{r.advertiser || "-"}</span>
                    {r.project && <span className="block text-muted-foreground">{r.project}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.creator}
                    <span className="block text-[11px] text-muted-foreground">시트 {r.row}행</span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(r.cost)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {money(r.after)}
                    {r.after === null && r.cost !== null && <span className="block text-[11px] text-muted-foreground">비용 기준 {won(payoutOf(r))}</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(r.revenue)}</TableCell>
                  <TableCell className="text-xs">
                    {r.uploaded ? (
                      r.uploadUrl ? (
                        <a href={/^https?:\/\//.test(r.uploadUrl) ? r.uploadUrl : undefined} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">O</a>
                      ) : (
                        "O"
                      )
                    ) : r.uploadNote ? (
                      <span className="text-amber-700" title={r.uploadNote}>확인</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "paid" ? "default" : r.status === "refund" ? "destructive" : "secondary"} className="font-normal">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.paidAt || (r.paidAtText ? <span className="text-amber-700" title="읽을 수 없는 형식">{r.paidAtText}</span> : <span className="text-muted-foreground">-</span>)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <span className="tabular-nums text-muted-foreground">{safePage + 1} / {pageCount}</span>
          <Button variant="outline" size="icon" className="size-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지"><ChevronLeftIcon className="size-4" /></Button>
          <Button variant="outline" size="icon" className="size-8" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지"><ChevronRightIcon className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}
