// 화면 설정: 사이드바 메뉴의 숨김·순서와 홈 카드의 표시·순서·너비. 지금은 이 브라우저에만 저장하고(localStorage),
// 나중에 팀 공용 저장소로 옮길 수 있게 저장하는 부분(load/save)만 따로 뒀다. 이 파일은 React와 무관한 순수 규칙만 담는다.
//
// "끄기"는 숨기기다: 메뉴·카드에서만 사라지고, 주소를 직접 열면 화면은 열린다.

export type WidgetId = "cleanup" | "status" | "pipeline" | "schedule" | "checks" | "response" | "deadline" | "months" | "activity" | "community" | "slack";
export type WidgetWidth = 4 | 6 | 8 | 12; // 12칸 격자: 1/3 · 1/2 · 2/3 · 전체

export type HomeWidget = { id: WidgetId; width: WidgetWidth; hidden: boolean };
export type MenuConfig = { hidden: string[]; order: Record<string, string[]> };
export type WorkspaceConfig = { version: 1; menus: MenuConfig; home: HomeWidget[] };

// 팀 공용 저장소에 들어가는 문서(서버가 version을 올리며 저장한다)
export type TeamDoc = { version: number; updatedAt: string; updatedBy: string; config: WorkspaceConfig };

export const STORAGE_KEY = "core-sales-workspace-config-v1";
export const WIDTHS: readonly WidgetWidth[] = [4, 6, 8, 12];
export const WIDTH_LABEL: Record<WidgetWidth, string> = { 4: "1/3", 6: "1/2", 8: "2/3", 12: "전체" };

export const WIDGETS: { id: WidgetId; label: string; width: WidgetWidth }[] = [
  { id: "cleanup", label: "정리 대기 알람", width: 12 },
  { id: "status", label: "영업 현황", width: 4 },
  { id: "pipeline", label: "파이프라인 분석", width: 4 },
  { id: "schedule", label: "오늘·내일 일정", width: 4 },
  { id: "checks", label: "오늘의 점검", width: 4 },
  { id: "response", label: "응답 속도", width: 4 },
  { id: "deadline", label: "마감 임박", width: 4 },
  { id: "months", label: "월별 문의", width: 6 },
  { id: "activity", label: "최근 활동", width: 6 },
  { id: "community", label: "크리에이터 커뮤니티", width: 4 },
  { id: "slack", label: "Slack 알림", width: 8 },
];
const WIDGET_IDS = WIDGETS.map((w) => w.id) as readonly string[];

// 아직 시트와 연결되지 않은 샘플 데이터 화면(샘플 안내가 붙는 화면과 같은 목록). 처음에는 메뉴에서 숨긴다.
export const SAMPLE_MENU_URLS = ["/calendar", "/weekly", "/quotes", "/team", "/campaigns", "/sales-invoices", "/agents", "/agents/routines"];
// 숨기면 길을 잃는 메뉴(대시보드)는 숨길 수 없다.
export const LOCKED_MENU_URLS = ["/"];

export const defaultConfig = (): WorkspaceConfig => ({
  version: 1,
  menus: { hidden: [...SAMPLE_MENU_URLS], order: {} },
  home: WIDGETS.map((w) => ({ id: w.id, width: w.width, hidden: false })),
});

const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

// 저장된 값을 읽을 때 모양을 검증한다. 깨졌거나 옛 버전이면 기본값. 모르는 카드는 버리고, 새로 생긴 카드는 기본 설정으로 덧붙인다.
export function normalizeConfig(raw: unknown): WorkspaceConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return base;

  const menus = r.menus as Record<string, unknown> | undefined;
  const hidden = menus && isStrArray(menus.hidden) ? menus.hidden.filter((u) => !LOCKED_MENU_URLS.includes(u)) : base.menus.hidden;
  const order: Record<string, string[]> = {};
  if (menus && menus.order && typeof menus.order === "object") {
    for (const [k, v] of Object.entries(menus.order as Record<string, unknown>)) if (isStrArray(v)) order[k] = v;
  }

  let home = base.home;
  if (Array.isArray(r.home)) {
    const seen = new Set<string>();
    const kept: HomeWidget[] = [];
    for (const w of r.home as Record<string, unknown>[]) {
      if (!w || typeof w.id !== "string" || !WIDGET_IDS.includes(w.id) || seen.has(w.id)) continue;
      seen.add(w.id);
      const def = WIDGETS.find((x) => x.id === w.id)!;
      kept.push({ id: w.id as WidgetId, width: (WIDTHS as readonly unknown[]).includes(w.width) ? (w.width as WidgetWidth) : def.width, hidden: w.hidden === true });
    }
    for (const d of base.home) if (!seen.has(d.id)) kept.push(d);
    home = kept;
  }
  return { version: 1, menus: { hidden, order }, home };
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export function loadConfig(storage: Storage): WorkspaceConfig {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? normalizeConfig(JSON.parse(text)) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(storage: Storage, config: WorkspaceConfig): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false; // 저장소를 못 쓰면(차단·용량) 이번 화면에서만 적용된다
  }
}

export const resetStored = (storage: Storage) => {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
};

// ── 변경 규칙(모두 새 객체를 돌려준다) ──
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export function moveWidget(c: WorkspaceConfig, id: WidgetId, dir: -1 | 1): WorkspaceConfig {
  const i = c.home.findIndex((w) => w.id === id);
  return { ...c, home: moveItem(c.home, i, i + dir) };
}
export const setWidgetWidth = (c: WorkspaceConfig, id: WidgetId, width: WidgetWidth): WorkspaceConfig => ({ ...c, home: c.home.map((w) => (w.id === id ? { ...w, width } : w)) });
export const toggleWidget = (c: WorkspaceConfig, id: WidgetId): WorkspaceConfig => ({ ...c, home: c.home.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)) });

export const isMenuHidden = (c: WorkspaceConfig, url: string) => c.menus.hidden.includes(url);
export function toggleMenu(c: WorkspaceConfig, url: string): WorkspaceConfig {
  if (LOCKED_MENU_URLS.includes(url)) return c;
  const hidden = isMenuHidden(c, url) ? c.menus.hidden.filter((u) => u !== url) : [...c.menus.hidden, url];
  return { ...c, menus: { ...c.menus, hidden } };
}

// 메뉴 순서는 대분류별로 url 목록을 저장한다. 목록에 없는 메뉴(새로 생긴 것)는 원래 순서대로 뒤에 붙는다.
export function applyOrder<T extends { url: string }>(items: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order || order.length === 0) return [...items];
  const rank = new Map(order.map((u, i) => [u, i]));
  return items
    .map((it, i) => ({ it, i, r: rank.get(it.url) }))
    .sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity) || a.i - b.i)
    .map((x) => x.it);
}

export function moveMenu(c: WorkspaceConfig, categoryId: string, items: readonly { url: string }[], url: string, dir: -1 | 1): WorkspaceConfig {
  const ordered = applyOrder(items, c.menus.order[categoryId]).map((i) => i.url);
  const i = ordered.indexOf(url);
  return { ...c, menus: { ...c.menus, order: { ...c.menus.order, [categoryId]: moveItem(ordered, i, i + dir) } } };
}

// 사이드바·메뉴 검색·⌘K에 보여 줄 대분류: 숨긴 메뉴는 빼고, 순서를 적용하고, 메뉴가 하나도 안 남은 대분류는 뺀다.
export function visibleCategories<C extends { id: string; items: readonly { url: string }[] }>(categories: readonly C[], c: WorkspaceConfig): (Omit<C, "items"> & { items: C["items"][number][] })[] {
  return categories
    .map((cat) => ({ ...cat, items: applyOrder(cat.items, c.menus.order[cat.id]).filter((i) => !isMenuHidden(c, i.url)) }))
    .filter((cat) => cat.items.length > 0);
}

export const visibleWidgets = (c: WorkspaceConfig) => c.home.filter((w) => !w.hidden);
