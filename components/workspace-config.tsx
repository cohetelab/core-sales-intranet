"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon } from "lucide-react";

import { NAV_CATEGORIES } from "@/components/nav-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LOCKED_MENU_URLS,
  SAMPLE_MENU_URLS,
  STORAGE_KEY,
  WIDGETS,
  WIDTHS,
  WIDTH_LABEL,
  applyOrder,
  defaultConfig,
  isMenuHidden,
  loadConfig,
  moveMenu,
  moveWidget,
  resetStored,
  saveConfig,
  setLeadsSince,
  setWidgetWidth,
  toggleMenu,
  toggleWidget,
  visibleCategories,
  type TeamDoc,
  type WidgetId,
  type WorkspaceConfig,
} from "@/lib/workspace-config";
import { cn } from "@/lib/utils";

// 화면 설정(사이드바 메뉴 숨김·순서, 홈 카드 표시·순서·너비). 이 브라우저에 저장한다. 끄기는 숨기기라 주소로는 열린다.

type Tab = "home" | "menu" | "data";

// 저장 상태: local(이 브라우저에만) · synced(팀 공용에 저장됨) · saving · error
export type Sync =
  | { state: "local"; reason: "login" | "no_backend" }
  | { state: "loading" }
  | { state: "synced"; empty: boolean; updatedAt?: string; updatedBy?: string }
  | { state: "saving" }
  | { state: "error" };

type Ctx = {
  config: WorkspaceConfig;
  ready: boolean;
  sync: Sync;
  update: (fn: (c: WorkspaceConfig) => WorkspaceConfig) => void;
  reset: () => void;
  openSettings: (tab?: Tab) => void;
};
const WorkspaceConfigContext = React.createContext<Ctx | null>(null);

export function useWorkspaceConfig(): Ctx {
  const ctx = React.useContext(WorkspaceConfigContext);
  if (!ctx) throw new Error("WorkspaceConfigProvider가 필요합니다");
  return ctx;
}

// 숨김·순서를 적용한 메뉴 대분류(사이드바·메뉴 검색·⌘K가 같이 쓴다)
export function useVisibleCategories() {
  const { config } = useWorkspaceConfig();
  return React.useMemo(() => visibleCategories(NAV_CATEGORIES, config), [config]);
}

const SAVE_DELAY_MS = 600;
const PULL_EVERY_MS = 60_000;

export function WorkspaceConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<WorkspaceConfig>(() => defaultConfig());
  const [ready, setReady] = React.useState(false);
  const [sync, setSync] = React.useState<Sync>({ state: "loading" });
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("home");

  // 화면 설정은 '변경 함수'로 받아서 적용한다. 팀 저장소에 저장할 때 그 사이 다른 사람이 먼저 바꿨으면(409),
  // 최신 설정 위에 같은 변경 함수를 다시 적용해서 두 사람의 변경이 모두 남게 한다.
  const configRef = React.useRef(config);
  const versionRef = React.useRef(0);
  const canSync = React.useRef(false); // 로그인했고 팀 저장소가 있을 때만 true
  const pending = React.useRef<((c: WorkspaceConfig) => WorkspaceConfig)[]>([]);
  const timer = React.useRef<number | null>(null);
  const flushing = React.useRef(false);

  const apply = React.useCallback((next: WorkspaceConfig) => {
    configRef.current = next;
    setConfig(next);
  }, []);

  const flush = React.useCallback(async () => {
    if (flushing.current || !canSync.current || pending.current.length === 0) return;
    flushing.current = true;
    const ops = pending.current.splice(0);
    setSync({ state: "saving" });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch("/api/leads/workspace-config", { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ config: configRef.current, baseVersion: versionRef.current }) });
        if (res.ok) {
          const { doc } = (await res.json()) as { doc: TeamDoc };
          versionRef.current = doc.version;
          setSync({ state: "synced", empty: false, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
          return;
        }
        if (res.status === 409) {
          const { doc } = (await res.json()) as { doc: TeamDoc };
          versionRef.current = doc.version;
          apply(ops.reduce((c, f) => f(c), doc.config)); // 최신 위에 내 변경을 다시 적용
          continue;
        }
        if (res.status === 401) canSync.current = false;
        throw new Error(String(res.status));
      }
      throw new Error("conflict_loop");
    } catch {
      pending.current.unshift(...ops); // 다음 기회에 다시 보낸다
      setSync(canSync.current ? { state: "error" } : { state: "local", reason: "login" });
    } finally {
      flushing.current = false;
    }
  }, [apply]);

  const schedule = React.useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  // 팀 설정 불러오기(처음, 창으로 돌아올 때, 1분마다, 로그인 직후)
  const pull = React.useCallback(async () => {
    if (flushing.current) return;
    try {
      const res = await fetch("/api/leads/workspace-config", { cache: "no-store" });
      if (res.status === 401) {
        canSync.current = false;
        return setSync({ state: "local", reason: "login" });
      }
      if (res.status === 503) {
        canSync.current = false; // 시트 연동이나 팀 저장소가 서버에 설정돼 있지 않다
        return setSync({ state: "local", reason: "no_backend" });
      }
      if (!res.ok) return setSync({ state: "error" });
      const { backend, doc } = (await res.json()) as { backend: string; doc: TeamDoc | null };
      if (backend === "none") {
        canSync.current = false;
        return setSync({ state: "local", reason: "no_backend" });
      }
      canSync.current = true;
      if (pending.current.length > 0) return void schedule(); // 보내지 못한 변경이 있으면 먼저 보낸다
      if (!doc) {
        versionRef.current = 0;
        return setSync({ state: "synced", empty: true });
      }
      versionRef.current = doc.version;
      if (JSON.stringify(doc.config) !== JSON.stringify(configRef.current)) apply(doc.config);
      setSync({ state: "synced", empty: false, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
    } catch {
      setSync(canSync.current ? { state: "error" } : { state: "local", reason: "login" });
    }
  }, [apply, schedule]);

  React.useEffect(() => {
    // 저장된 설정은 마운트 이후 클라이언트에서만 읽을 수 있다(먼저 이 브라우저의 값으로 바로 그린 뒤 팀 설정으로 덮는다).
    /* eslint-disable react-hooks/set-state-in-effect */
    apply(loadConfig(window.localStorage));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void pull();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) apply(loadConfig(window.localStorage));
    };
    const onFocus = () => void pull();
    // 저장 대기 중에 페이지를 떠나거나 새로고침해도 마지막 변경이 사라지지 않게 바로 보낸다(keepalive 요청은 페이지가 닫혀도 이어진다).
    const onLeave = () => {
      if (timer.current) window.clearTimeout(timer.current);
      void flush();
    };
    const onVisible = () => document.visibilityState === "visible" && void pull();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("focus", onFocus);
    window.addEventListener("core-sales-login", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(() => void pull(), PULL_EVERY_MS);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("core-sales-login", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(iv);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [apply, pull, flush]);

  // 이 브라우저에도 사본을 둔다(팀 저장소를 못 쓸 때의 대비이자 첫 화면을 빨리 그리기 위함)
  React.useEffect(() => {
    if (ready) saveConfig(window.localStorage, config);
  }, [config, ready]);

  const update = React.useCallback(
    (fn: (c: WorkspaceConfig) => WorkspaceConfig) => {
      apply(fn(configRef.current));
      if (canSync.current) {
        pending.current.push(fn);
        schedule();
      }
    },
    [apply, schedule]
  );
  const reset = React.useCallback(() => {
    resetStored(window.localStorage);
    update(() => defaultConfig());
  }, [update]);
  const openSettings = React.useCallback((t: Tab = "home") => {
    setTab(t);
    setOpen(true);
  }, []);

  const value = React.useMemo(() => ({ config, ready, sync, update, reset, openSettings }), [config, ready, sync, update, reset, openSettings]);
  const shared = sync.state === "synced" || sync.state === "saving";
  return (
    <WorkspaceConfigContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl" aria-describedby="workspace-settings-desc">
          <DialogHeader>
            <DialogTitle>화면 설정</DialogTitle>
            <DialogDescription id="workspace-settings-desc">
              {shared ? "바꾸면 모든 팀원의 화면에 적용됩니다. " : "지금은 이 브라우저에서 보이는 화면만 바뀝니다. "}끄면 메뉴·카드에서 숨겨질 뿐이고, 주소를 직접 열면 화면은 열립니다.
            </DialogDescription>
          </DialogHeader>
          <SyncStatus sync={sync} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-col">
            <TabsList>
              <TabsTrigger value="home">홈 카드</TabsTrigger>
              <TabsTrigger value="menu">사이드바 메뉴</TabsTrigger>
              <TabsTrigger value="data">데이터 범위</TabsTrigger>
            </TabsList>
            <TabsContent value="home">
              <HomeCards />
            </TabsContent>
            <TabsContent value="menu">
              <SidebarMenus />
            </TabsContent>
            <TabsContent value="data">
              <DataRange />
            </TabsContent>
          </Tabs>
          <div className="flex justify-end border-t pt-3">
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcwIcon className="size-3.5" /> 기본 설정으로 되돌리기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceConfigContext.Provider>
  );
}

// 데이터 범위: 기준일보다 옛 고객(그 뒤 활동도 없는)은 리드·파이프라인·리포트·홈에서 숨긴다. 시트는 건드리지 않는다.
function DataRange() {
  const { config, update } = useWorkspaceConfig();
  const since = config.leadsSince;
  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-muted-foreground">
        기준일보다 먼저 들어왔고 그 뒤로 기록·재문의도 없는 고객은 화면에서 숨깁니다. <b>구글 시트의 데이터는 그대로</b>이고, 기준일을 비우면 전부 다시 보입니다. 옛 고객이 다시 문의하거나 기록이 쌓이면 자동으로 다시 보입니다.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <span className="w-24 shrink-0">기준일</span>
        <input
          type="date"
          aria-label="리드 기준일"
          value={since ?? ""}
          onChange={(e) => update((c) => setLeadsSince(c, e.target.value || null))}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
        <Button variant="outline" size="sm" disabled={!since} onClick={() => update((c) => setLeadsSince(c, null))}>
          전체 보기
        </Button>
      </label>
      <p className="text-xs text-muted-foreground">
        {since ? `${since} 이전 고객을 숨기는 중입니다.` : "지금은 시트의 모든 고객이 보입니다."} 정리 알람·Slack 알림은 시트 전체를 기준으로 계산됩니다.
      </p>
    </div>
  );
}

// 저장 상태 안내(팀 공용으로 저장되는지, 이 브라우저에만 적용되는지)
function SyncStatus({ sync }: { sync: Sync }) {
  const kst = (iso?: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "");
  let text = "";
  let tone = "bg-muted text-muted-foreground";
  if (sync.state === "loading") text = "팀 설정을 불러오는 중…";
  else if (sync.state === "saving") text = "팀 공용 설정에 저장하는 중…";
  else if (sync.state === "synced") {
    text = sync.empty ? "팀 공용 설정 · 아직 저장된 적이 없어 기본 구성입니다. 바꾸면 모든 팀원에게 저장됩니다." : `팀 공용 설정 · 저장됨${sync.updatedBy ? ` (마지막 수정 ${sync.updatedBy.replace(/\(.*\)/, "")} ${kst(sync.updatedAt)})` : ""}`;
    tone = "bg-emerald-50 text-emerald-900";
  } else if (sync.state === "error") {
    text = "팀 설정을 저장하지 못했습니다. 이 브라우저에는 적용됐고 잠시 뒤 다시 시도합니다.";
    tone = "bg-amber-50 text-amber-900";
  } else if (sync.reason === "login") text = "로그인 전이라 이 브라우저에만 적용됩니다. 로그인하면 팀 공용 설정을 불러옵니다.";
  else text = "팀 공용 저장소가 설정되지 않아 이 브라우저에만 적용됩니다.";
  return (
    <p role="status" aria-label="저장 상태" className={cn("rounded-xl px-3 py-1.5 text-xs", tone)}>
      {text}
    </p>
  );
}

function MoveButtons({ label, onUp, onDown, disableUp, disableDown }: { label: string; onUp: () => void; onDown: () => void; disableUp: boolean; disableDown: boolean }) {
  return (
    <div className="flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`${label} 위로`} disabled={disableUp} onClick={onUp}>
        <ArrowUpIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`${label} 아래로`} disabled={disableDown} onClick={onDown}>
        <ArrowDownIcon />
      </Button>
    </div>
  );
}

function HomeCards() {
  const { config, update } = useWorkspaceConfig();
  const label = (id: WidgetId) => WIDGETS.find((w) => w.id === id)?.label ?? id;
  return (
    <ul className="space-y-1.5" aria-label="홈 카드 목록">
      {config.home.map((w, i) => (
        <li key={w.id} className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5", w.hidden && "bg-muted/40 text-muted-foreground")}>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <Checkbox checked={!w.hidden} onCheckedChange={() => update((c) => toggleWidget(c, w.id))} aria-label={`${label(w.id)} 표시`} />
            <span className="truncate">{label(w.id)}</span>
          </label>
          <div className="flex items-center gap-0.5" role="group" aria-label={`${label(w.id)} 너비`}>
            {WIDTHS.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={w.width === x}
                onClick={() => update((c) => setWidgetWidth(c, w.id, x))}
                className={cn("h-6 rounded-full px-2 text-[11px] ring-1 transition-colors", w.width === x ? "bg-primary text-primary-foreground ring-primary" : "ring-foreground/10 hover:bg-muted")}
              >
                {WIDTH_LABEL[x]}
              </button>
            ))}
          </div>
          <MoveButtons label={label(w.id)} onUp={() => update((c) => moveWidget(c, w.id, -1))} onDown={() => update((c) => moveWidget(c, w.id, 1))} disableUp={i === 0} disableDown={i === config.home.length - 1} />
        </li>
      ))}
    </ul>
  );
}

function SidebarMenus() {
  const { config, update } = useWorkspaceConfig();
  return (
    <div className="space-y-4">
      {NAV_CATEGORIES.map((cat) => {
        const items = applyOrder(cat.items, config.menus.order[cat.id]);
        return (
          <section key={cat.id} aria-label={`${cat.label} 메뉴`}>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{cat.label}</h3>
            <ul className="space-y-1">
              {items.map((item, i) => {
                const locked = LOCKED_MENU_URLS.includes(item.url);
                const hidden = isMenuHidden(config, item.url);
                return (
                  <li key={item.url} className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-1", hidden && "bg-muted/40 text-muted-foreground")}>
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <Checkbox checked={!hidden} disabled={locked} onCheckedChange={() => update((c) => toggleMenu(c, item.url))} aria-label={`${item.title} 표시`} />
                      <span className="truncate">{item.title}</span>
                      {SAMPLE_MENU_URLS.includes(item.url) && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                          샘플 데이터
                        </Badge>
                      )}
                      {locked && <span className="text-[10px] text-muted-foreground">(항상 표시)</span>}
                    </label>
                    <MoveButtons
                      label={item.title}
                      onUp={() => update((c) => moveMenu(c, cat.id, cat.items, item.url, -1))}
                      onDown={() => update((c) => moveMenu(c, cat.id, cat.items, item.url, 1))}
                      disableUp={i === 0}
                      disableDown={i === items.length - 1}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
