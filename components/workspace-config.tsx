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
  setWidgetWidth,
  toggleMenu,
  toggleWidget,
  visibleCategories,
  type WidgetId,
  type WorkspaceConfig,
} from "@/lib/workspace-config";
import { cn } from "@/lib/utils";

// 화면 설정(사이드바 메뉴 숨김·순서, 홈 카드 표시·순서·너비). 이 브라우저에 저장한다. 끄기는 숨기기라 주소로는 열린다.

type Tab = "home" | "menu";
type Ctx = {
  config: WorkspaceConfig;
  ready: boolean;
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

export function WorkspaceConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<WorkspaceConfig>(() => defaultConfig());
  const [ready, setReady] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("home");

  React.useEffect(() => {
    // 저장된 설정은 마운트 이후 클라이언트에서만 읽을 수 있다.
    /* eslint-disable react-hooks/set-state-in-effect */
    setConfig(loadConfig(window.localStorage));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // 다른 탭에서 바꾸면 이 탭도 따라간다.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setConfig(loadConfig(window.localStorage));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    if (ready) saveConfig(window.localStorage, config);
  }, [config, ready]);

  const update = React.useCallback((fn: (c: WorkspaceConfig) => WorkspaceConfig) => setConfig((c) => fn(c)), []);
  const reset = React.useCallback(() => {
    resetStored(window.localStorage);
    setConfig(defaultConfig());
  }, []);
  const openSettings = React.useCallback((t: Tab = "home") => {
    setTab(t);
    setOpen(true);
  }, []);

  const value = React.useMemo(() => ({ config, ready, update, reset, openSettings }), [config, ready, update, reset, openSettings]);
  return (
    <WorkspaceConfigContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl" aria-describedby="workspace-settings-desc">
          <DialogHeader>
            <DialogTitle>화면 설정</DialogTitle>
            <DialogDescription id="workspace-settings-desc">
              이 브라우저에서 보이는 화면만 바뀝니다. 끄면 메뉴·카드에서 숨겨질 뿐이고, 주소를 직접 열면 화면은 열립니다.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-col">
            <TabsList>
              <TabsTrigger value="home">홈 카드</TabsTrigger>
              <TabsTrigger value="menu">사이드바 메뉴</TabsTrigger>
            </TabsList>
            <TabsContent value="home">
              <HomeCards />
            </TabsContent>
            <TabsContent value="menu">
              <SidebarMenus />
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
