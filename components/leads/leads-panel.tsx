"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LogOutIcon,
  RefreshCw,
  SearchIcon,
  ShuffleIcon,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { ContractDialog } from "@/components/leads/contract-dialog";
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet";
import { LeadImportDialog } from "@/components/leads/lead-import-dialog";
import { MetaSheetDialog } from "@/components/leads/meta-sheet-dialog";
import { SheetLoginCard } from "@/components/leads/sheet-login-card";
import { SOURCE_LABEL } from "@/lib/mock-data";
import { useCustomerStore } from "@/lib/customer-store";
import { formatDateTime, formatKst } from "@/lib/format";
import { CHANNELS, SERVICE_LABELS, planBalancedAssignment } from "@/lib/lead-sheet";
import {
  clearMetaSheetConfig,
  loadMetaSheetConfig,
  normalizeSheetCsvUrl,
  parseMetaLeadsCsv,
  saveMetaSheetConfig,
  type MetaSheetConfig,
} from "@/lib/meta-leads";
import { OWNER_OPTIONS, SALES_REPS, UNASSIGNED } from "@/lib/sales-reps";
import { useSheetLeads } from "@/lib/sheet-leads";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const CSV_MODE_KEY = "core-sales-leads-csv-mode";
const UNCLASSIFIED = "미분류";

type ServiceFilter = "all" | (typeof SERVICE_LABELS)[number] | typeof UNCLASSIFIED;
type OwnerFilter = "all" | string;

const digits = (s: string) => s.replace(/\D/g, "");

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-2xl px-3 text-xs ring-1 ring-foreground/10 transition-colors",
        active ? "bg-primary text-primary-foreground ring-primary" : "hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

const channelOf = (c: Customer) =>
  c.tags.find((t) => (CHANNELS as readonly string[]).includes(t)) ?? SOURCE_LABEL[c.source];

export function LeadsPanel() {
  const { customers: localCustomers, addCustomer, assignOwner: localAssign, moveStage } = useCustomerStore();
  const sheet = useSheetLeads();
  // CSV 방식: 구글 시트 연동이 설정돼 있어도 시트를 CSV 파일로 내려받아 올려서 쓸 수 있다(선택은 이 브라우저에 기억한다).
  const [csvMode, setCsvMode] = React.useState(false);
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCsvMode(window.localStorage.getItem(CSV_MODE_KEY) === "1");
    } catch {
      // 저장소를 못 쓰면 기본값(구글 연동)으로 둔다
    }
  }, []);
  function chooseCsvMode(on: boolean) {
    setCsvMode(on);
    try {
      if (on) window.localStorage.setItem(CSV_MODE_KEY, "1");
      else window.localStorage.removeItem(CSV_MODE_KEY);
    } catch {
      // 무시
    }
  }
  // 구글 시트 연동이 설정돼 있고 CSV 방식을 고르지 않았으면 시트가 원본이다. 아니면 브라우저 저장소 + CSV 가져오기로 동작한다.
  const sheetMode = !csvMode && sheet.status !== "off" && sheet.status !== "checking";
  const customers = sheetMode ? sheet.customers : localCustomers;
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sheetConfig, setSheetConfig] = React.useState<MetaSheetConfig | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [service, setService] = React.useState<ServiceFilter>("all");
  const [owner, setOwner] = React.useState<OwnerFilter>("all");
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = React.useState<string>(SALES_REPS[0]);

  React.useEffect(() => {
    // localStorage는 마운트 이후 클라이언트에서만 읽을 수 있다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheetConfig(loadMetaSheetConfig());
  }, []);

  const leads = React.useMemo(
    () =>
      customers
        .filter((c) => c.stage === "lead")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [customers]
  );

  const matchesQuery = React.useCallback(
    (c: Customer) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const qd = digits(q);
      return (
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qd.length >= 3 && digits(c.phone).includes(qd)) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    },
    [query]
  );
  const matchesService = (c: Customer, f: ServiceFilter) =>
    f === "all" || (f === UNCLASSIFIED ? c.category === UNCLASSIFIED : c.category.includes(f));
  const matchesOwner = (c: Customer, f: OwnerFilter) => f === "all" || c.owner === f;

  const filtered = React.useMemo(
    () => leads.filter((c) => matchesQuery(c) && matchesService(c, service) && matchesOwner(c, owner)),
    [leads, matchesQuery, service, owner]
  );

  // 칩에 보이는 건수: 다른 필터는 적용하고 자기 축은 빼서 센다.
  const serviceCounts = React.useMemo(() => {
    const base = leads.filter((c) => matchesQuery(c) && matchesOwner(c, owner));
    const map = new Map<ServiceFilter, number>([["all", base.length]]);
    for (const l of [...SERVICE_LABELS, UNCLASSIFIED] as ServiceFilter[]) map.set(l, base.filter((c) => matchesService(c, l)).length);
    return map;
  }, [leads, matchesQuery, owner]);
  const ownerCounts = React.useMemo(() => {
    const base = leads.filter((c) => matchesQuery(c) && matchesService(c, service));
    const map = new Map<string, number>([["all", base.length]]);
    for (const o of OWNER_OPTIONS) map.set(o, base.filter((c) => c.owner === o).length);
    return map;
  }, [leads, matchesQuery, service]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const unassignedInView = filtered.filter((c) => c.owner === UNASSIGNED);
  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function resetPage() {
    setPage(0);
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((c) => c.id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function assignOwner(ids: string[], owner: string) {
    if (sheetMode) await sheet.assign(ids, owner);
    else localAssign(ids, owner);
  }
  function convertToContract(id: string, amount?: number) {
    if (sheetMode) void sheet.convert(id, amount);
    else moveStage(id, "won");
  }

  function assignSelected() {
    void assignOwner(Array.from(selected), bulkOwner);
    setSelected(new Set());
  }

  // 미배정 리드를 현재 맡은 건수가 적은 영업부터 번갈아 배정한다.
  const loadByRep = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const rep of SALES_REPS) m[rep] = leads.filter((c) => c.owner === rep).length;
    return m;
  }, [leads]);
  const balancedPlan = React.useMemo(
    () => planBalancedAssignment(unassignedInView.map((c) => c.id), loadByRep),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, loadByRep]
  );
  async function runBalancedAssignment() {
    for (const rep of SALES_REPS) await assignOwner(balancedPlan[rep], rep);
  }

  function handleSaveSheet(url: string) {
    const config: MetaSheetConfig = {
      url: normalizeSheetCsvUrl(url),
      importedKeys: [],
    };
    saveMetaSheetConfig(config);
    setSheetConfig(config);
    setSyncMessage(null);
  }

  function handleDisconnectSheet() {
    clearMetaSheetConfig();
    setSheetConfig(null);
    setSyncMessage(null);
  }

  async function handleSync() {
    if (!sheetConfig) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(sheetConfig.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseMetaLeadsCsv(text);
      const importedKeys = new Set(sheetConfig.importedKeys);
      const newRows = parsed.filter((r) => !importedKeys.has(r.key));

      for (const row of newRows) {
        addCustomer({
          company: row.company,
          category: row.category,
          manager: row.manager,
          email: row.email,
          source: "inbound",
          owner: UNASSIGNED,
        });
        importedKeys.add(row.key);
      }

      const nextConfig: MetaSheetConfig = {
        ...sheetConfig,
        lastSyncedAt: new Date().toISOString(),
        importedKeys: Array.from(importedKeys),
      };
      saveMetaSheetConfig(nextConfig);
      setSheetConfig(nextConfig);
      setSyncMessage(
        newRows.length > 0
          ? `신규 리드 ${newRows.length}건을 가져왔습니다`
          : "새로 들어온 리드가 없습니다"
      );
    } catch {
      setSyncMessage(
        "동기화 실패 — 시트가 웹에 게시(공개)되어 있는지 확인해주세요"
      );
    } finally {
      setSyncing(false);
    }
  }

  if (!csvMode && sheet.status === "checking") {
    return <p className="py-10 text-center text-sm text-muted-foreground">연결을 확인하는 중…</p>;
  }
  if (!csvMode && sheet.status === "login") return <SheetLoginCard onLogin={sheet.login} onUseCsv={() => chooseCsvMode(true)} />;
  if (!csvMode && sheet.status === "loading") {
    return <p className="py-10 text-center text-sm text-muted-foreground">시트에서 리드를 불러오는 중…</p>;
  }
  if (!csvMode && sheet.status === "error") {
    return (
      <Card className="mx-auto w-full max-w-md shadow-xs">
        <CardContent className="space-y-3 text-center">
          <p className="text-sm font-medium">시트를 불러오지 못했습니다</p>
          <p role="alert" className="text-xs text-muted-foreground">{sheet.notice?.text ?? "잠시 뒤에 다시 시도해 주세요"}</p>
          <Button variant="outline" size="sm" onClick={() => void sheet.refresh()}>
            다시 시도
          </Button>
          <button type="button" onClick={() => chooseCsvMode(true)} className="block w-full text-center text-xs text-muted-foreground underline hover:text-foreground">
            구글 시트 연동 없이 CSV 파일로 가져오기
          </button>
        </CardContent>
      </Card>
    );
  }
  const detail = sheetMode && detailId ? (customers.find((c) => c.id === detailId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          아직 상담이 시작되지 않은 신규 리드 · 총 {leads.length.toLocaleString("ko-KR")}건
          {filtered.length !== leads.length && <> · 조건에 맞는 {filtered.length.toLocaleString("ko-KR")}건</>}
        </p>
        {sheetMode ? (
          <div className="flex flex-wrap gap-2">
            {sheet.sheetUrl.startsWith("https://docs.google.com/") && (
              <Button asChild variant="outline" className="h-9 py-2">
                <a href={sheet.sheetUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-3.5" /> 시트 열기
                </a>
              </Button>
            )}
            <Button variant="outline" className="h-9 py-2" disabled={sheet.refreshing} onClick={() => void sheet.refresh()}>
              <RefreshCw className={`size-3.5 ${sheet.refreshing ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <LeadImportDialog />
            <MetaSheetDialog
              currentUrl={sheetConfig?.url ?? null}
              onSave={handleSaveSheet}
              onDisconnect={handleDisconnectSheet}
            />
            <Button
              variant="outline"
              className="h-9 py-2"
              disabled={!sheetConfig || syncing}
              onClick={handleSync}
              title={
                sheetConfig
                  ? "메타 잠재고객 시트에서 신규 리드 가져오기"
                  : "먼저 메타 시트를 연동해주세요"
              }
            >
              <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <AddCustomerDialog triggerLabel="리드 추가" />
          </div>
        )}
      </div>

      {csvMode && sheet.status !== "off" && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>지금은 CSV 파일로 가져오는 방식입니다(이 브라우저에만 저장).</span>
          <button type="button" onClick={() => chooseCsvMode(false)} className="underline hover:text-foreground">
            구글 시트 연동으로 돌아가기
          </button>
        </div>
      )}
      {sheetMode && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            구글 시트 연동 · 시트가 원본입니다
          </span>
          {sheet.fetchedAt && <span>· 마지막 확인 {formatDateTime(sheet.fetchedAt)}</span>}
          <span>· 30초마다 새로 확인</span>
          <button type="button" onClick={() => chooseCsvMode(true)} className="underline hover:text-foreground">
            CSV 방식으로 전환
          </button>
          {sheet.user && (
            <span className="flex items-center gap-1">
              · {sheet.user}
              <button type="button" onClick={() => void sheet.logout()} className="inline-flex items-center gap-0.5 underline hover:text-foreground">
                <LogOutIcon className="size-3" /> 나가기
              </button>
            </span>
          )}
        </div>
      )}
      {sheetMode && sheet.notice && (
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

      {sheetConfig && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            메타 잠재고객 시트 연동됨
          </span>
          {sheetConfig.lastSyncedAt && (
            <span>· 마지막 동기화 {formatDateTime(sheetConfig.lastSyncedAt)}</span>
          )}
          {syncMessage && (
            <span className="flex items-center gap-1 text-foreground">
              <AlertCircleIcon className="size-3" /> {syncMessage}
            </span>
          )}
        </div>
      )}

      {leads.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder="상호·연락처·이메일 검색"
                aria-label="리드 검색"
                className="h-8 w-60 pl-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="서비스 필터">
              {(["all", ...SERVICE_LABELS, UNCLASSIFIED] as ServiceFilter[]).map((f) => (
                <Chip key={f} active={service === f} onClick={() => { setService(f); resetPage(); }}>
                  {f === "all" ? "전체 서비스" : f}
                  <span className="tabular-nums opacity-70">{(serviceCounts.get(f) ?? 0).toLocaleString("ko-KR")}</span>
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="담당 필터">
              {(["all", ...OWNER_OPTIONS] as OwnerFilter[]).map((f) => (
                <Chip key={f} active={owner === f} onClick={() => { setOwner(f); resetPage(); }}>
                  {f === "all" ? "전체 담당" : f}
                  <span className="tabular-nums opacity-70">{(ownerCounts.get(f) ?? 0).toLocaleString("ko-KR")}</span>
                </Chip>
              ))}
            </div>
            {unassignedInView.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <ShuffleIcon className="size-3.5" /> 미배정 {unassignedInView.length.toLocaleString("ko-KR")}건 자동 배분
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>미배정 {unassignedInView.length.toLocaleString("ko-KR")}건을 자동으로 배분할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      지금 맡은 건수가 적은 영업부터 번갈아 배정합니다.{" "}
                      {SALES_REPS.map((r) => `${r} +${balancedPlan[r].length}건`).join(" · ")} 로 나뉩니다. 배정 이력은 각 고객의 활동에 남고, 담당 칸에서 언제든 바꿀 수 있습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void runBalancedAssignment()}>배분하기</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-primary/5 px-3 py-2 text-sm ring-1 ring-primary/20">
          <span className="font-medium">{selected.size.toLocaleString("ko-KR")}건 선택됨</span>
          <Select value={bulkOwner} onValueChange={setBulkOwner}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="일괄 담당 선택">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNER_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8" onClick={assignSelected}>
            담당 배정
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">등록된 리드가 없습니다</p>
              {!sheetMode && <p className="text-xs text-muted-foreground">오른쪽 위 &lsquo;CSV 가져오기&rsquo;로 문의 시트를 불러오세요.</p>}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 리드가 없습니다</div>
          ) : (
            <Table className="[&_:is(th,td)]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v === true)} aria-label={`조건에 맞는 ${filtered.length}건 전체 선택`} />
                  </TableHead>
                  <TableHead className="w-32">문의일시</TableHead>
                  <TableHead>상호명</TableHead>
                  <TableHead>서비스</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead className="w-20 text-center">채널</TableHead>
                  <TableHead className="w-44">담당 영업</TableHead>
                  <TableHead>다음 액션</TableHead>
                  <TableHead className="w-24 text-center">계약</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const note = c.tags.filter((t) => /^(재문의|이전 담당)/.test(t));
                  const owners = OWNER_OPTIONS.includes(c.owner) ? OWNER_OPTIONS : [...OWNER_OPTIONS, c.owner];
                  return (
                    <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => toggleOne(c.id, v === true)} aria-label={`${c.company} 선택`} />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatKst(c.createdAt)}</TableCell>
                      <TableCell className="font-medium">
                        {sheetMode ? (
                          <button type="button" onClick={() => setDetailId(c.id)} className="text-left hover:underline">
                            {c.company}
                          </button>
                        ) : (
                          <Link href={`/customers?id=${c.id}`} className="hover:underline">
                            {c.company}
                          </Link>
                        )}
                        {note.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {note.map((t) => (
                              <Badge key={t} variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{c.phone || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{channelOf(c)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={c.owner} onValueChange={(v) => void assignOwner([c.id], v)}>
                          <SelectTrigger
                            className={cn("h-8 w-40 text-xs", c.owner === UNASSIGNED && "text-amber-700")}
                            aria-label={`${c.company} 담당 영업`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {owners.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={c.nextStep}>
                        {c.nextStep ?? "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <ContractDialog company={c.company} askAmount={sheetMode} onConfirm={(amount) => convertToContract(c.id, amount)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {sheetMode && (
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
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {(safePage * PAGE_SIZE + 1).toLocaleString("ko-KR")}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString("ko-KR")} / {filtered.length.toLocaleString("ko-KR")}
          </span>
          <Button variant="outline" size="icon-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지">
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">{safePage + 1} / {pageCount}</span>
          <Button variant="outline" size="icon-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지">
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
