const { load } = require("../support/run.cjs");
const w = load("workspace-config");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), _m: m }; };

// 기본값
const d = w.defaultConfig();
ok("기본: 샘플 화면 8개가 숨김", d.menus.hidden.length === 8 && ["/team", "/weekly", "/calendar", "/quotes", "/campaigns", "/sales-invoices", "/agents", "/agents/routines"].every((u) => d.menus.hidden.includes(u)));
ok("기본: 홈 카드 12개가 모두 표시", d.home.length === 12 && d.home.every((x) => !x.hidden));
ok("기본 카드 너비: 영업 현황 1/3 · 월별 문의 1/2 · 정리 대기 전체", d.home.find((x) => x.id === "status").width === 4 && d.home.find((x) => x.id === "months").width === 6 && d.home.find((x) => x.id === "cleanup").width === 12);
ok("기본값은 호출마다 새 객체(공유 변경 방지)", w.defaultConfig() !== w.defaultConfig() && (w.defaultConfig().menus.hidden.push("x"), w.defaultConfig().menus.hidden.length === 8));

// 읽기·쓰기
const s = mem();
ok("저장 안 된 상태 → 기본값", JSON.stringify(w.loadConfig(s)) === JSON.stringify(d));
let c = w.toggleMenu(d, "/team"); // 숨김 해제
c = w.toggleWidget(c, "slack");
ok("저장 → 다시 읽으면 같은 설정", w.saveConfig(s, c) && JSON.stringify(w.loadConfig(s)) === JSON.stringify(c));
ok("저장 키는 한 곳", [...s._m.keys()].join() === w.STORAGE_KEY);
w.resetStored(s);
ok("초기화하면 기본값", JSON.stringify(w.loadConfig(s)) === JSON.stringify(d));
const full = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
ok("저장소가 막혀도 안 터짐(false 반환)", w.saveConfig(full, c) === false);
const broken = { getItem: () => "{깨진 JSON", setItem() {}, removeItem() {} };
ok("깨진 저장값 → 기본값", JSON.stringify(w.loadConfig(broken)) === JSON.stringify(d));

// 검증(normalize)
ok("옛 버전·이상한 값 → 기본값", JSON.stringify(w.normalizeConfig({ version: 2 })) === JSON.stringify(d) && JSON.stringify(w.normalizeConfig(null)) === JSON.stringify(d) && JSON.stringify(w.normalizeConfig("x")) === JSON.stringify(d));
const n1 = w.normalizeConfig({ version: 1, menus: { hidden: ["/", "/leads"], order: { sales: ["/leads", 5] } }, home: [{ id: "slack", width: 12, hidden: true }, { id: "없는카드", width: 4 }, { id: "status", width: 99, hidden: false }, { id: "slack", width: 4 }] });
ok("대시보드(/)는 숨김 목록에서 제거", !n1.menus.hidden.includes("/") && n1.menus.hidden.includes("/leads"));
ok("깨진 순서 목록은 버림", n1.menus.order.sales === undefined);
ok("모르는 카드·중복 카드 제거, 앞에 저장된 순서 유지", n1.home[0].id === "slack" && n1.home[0].hidden === true && n1.home.filter((x) => x.id === "slack").length === 1 && !n1.home.some((x) => x.id === "없는카드"));
ok("잘못된 너비는 기본 너비로", n1.home.find((x) => x.id === "status").width === 4);
ok("새로 생긴 카드는 기본 설정으로 뒤에 덧붙음(누락 없음)", n1.home.length === 12);

// 변경 규칙
let m = w.moveWidget(d, "status", 1);
ok("카드 아래로: status ↔ target(월 목표 달성률)", m.home[1].id === "target" && m.home[2].id === "status" && d.home[1].id === "status");
ok("맨 위 카드를 위로·맨 아래를 아래로 올리면 그대로", JSON.stringify(w.moveWidget(d, "cleanup", -1).home.map((x) => x.id)) === JSON.stringify(d.home.map((x) => x.id)) && JSON.stringify(w.moveWidget(d, "slack", 1).home.map((x) => x.id)) === JSON.stringify(d.home.map((x) => x.id)));
ok("너비 변경·표시 토글", w.setWidgetWidth(d, "status", 12).home[1].width === 12 && w.toggleWidget(d, "status").home[1].hidden === true && w.toggleWidget(w.toggleWidget(d, "status"), "status").home[1].hidden === false);
ok("메뉴 숨김 토글(켜고 끄기)", w.isMenuHidden(w.toggleMenu(d, "/leads"), "/leads") && !w.isMenuHidden(w.toggleMenu(w.toggleMenu(d, "/leads"), "/leads"), "/leads"));
ok("대시보드는 토글해도 안 숨겨짐", !w.isMenuHidden(w.toggleMenu(d, "/"), "/"));

// 메뉴 순서·보이는 대분류
const cats = [
  { id: "home", label: "홈", items: [{ url: "/", title: "대시보드" }, { url: "/calendar", title: "캘린더" }, { url: "/weekly", title: "주간" }] },
  { id: "sales", label: "영업", items: [{ url: "/pipeline", title: "파이프라인" }, { url: "/leads", title: "리드" }, { url: "/customers", title: "고객사" }, { url: "/team", title: "팀" }] },
  { id: "campaign", label: "캠페인", items: [{ url: "/campaigns", title: "캠페인 운영" }] },
];
let v = w.visibleCategories(cats, d);
ok("기본: 샘플 메뉴가 빠지고, 메뉴가 없어진 대분류(캠페인)도 빠짐", v.map((x) => x.id).join() === "home,sales" && v[0].items.map((i) => i.url).join() === "/" && v[1].items.map((i) => i.url).join() === "/pipeline,/leads,/customers");
const c2 = w.toggleMenu(w.toggleMenu(d, "/team"), "/campaigns"); // 숨김 해제
ok("숨김을 풀면 다시 보임", w.visibleCategories(cats, c2).map((x) => x.id).join() === "home,sales,campaign" && w.visibleCategories(cats, c2)[1].items.some((i) => i.url === "/team"));
const c3 = w.moveMenu(d, "sales", cats[1].items, "/leads", -1);
ok("메뉴 위로: 리드 ↔ 파이프라인", w.visibleCategories(cats, c3)[1].items.map((i) => i.url).join() === "/leads,/pipeline,/customers");
const c4 = w.moveMenu(c3, "sales", cats[1].items, "/customers", -1);
ok("메뉴 순서 누적: 리드 → 고객사 → 파이프라인", w.visibleCategories(cats, c4)[1].items.map((i) => i.url).join() === "/leads,/customers,/pipeline", w.visibleCategories(cats, c4)[1].items.map((i) => i.url).join());
const cats2 = [{ ...cats[0] }, { ...cats[1], items: [...cats[1].items, { url: "/reports", title: "리포트" }] }, cats[2]];
ok("새로 생긴 메뉴는 저장된 순서 뒤에 붙음", w.visibleCategories(cats2, c4)[1].items.map((i) => i.url).join() === "/leads,/customers,/pipeline,/reports");
ok("원본 카테고리 목록은 바뀌지 않음", cats[1].items.map((i) => i.url).join() === "/pipeline,/leads,/customers,/team");
ok("applyOrder: 목록이 비어 있으면 원래 순서", w.applyOrder(cats[1].items, undefined).map((i) => i.url).join() === "/pipeline,/leads,/customers,/team");

// 기준일(leadsSince): 시트는 그대로 두고 화면에서만 옛 고객을 숨긴다
ok("기본: 기준일 없음(전부 보임)", d.leadsSince === null);
ok("기준일 설정·해제", w.setLeadsSince(d, "2026-11-02").leadsSince === "2026-11-02" && w.setLeadsSince(w.setLeadsSince(d, "2026-11-02"), null).leadsSince === null);
ok("깨진 기준일은 무시(null)", ["내일", "2026-13-45", "2026/11/02", 20261102, ""].every((v) => w.setLeadsSince(d, v).leadsSince === null) && w.normalizeConfig({ version: 1, leadsSince: "아무거나" }).leadsSince === null);
ok("저장된 기준일은 다시 읽어도 유지", w.normalizeConfig(JSON.parse(JSON.stringify(w.setLeadsSince(d, "2026-10-01")))).leadsSince === "2026-10-01");
const cu = (createdAt, lastActivityAt) => ({ createdAt, lastActivityAt });
ok("기준일 전에 들어오고 활동도 없으면 숨김", w.isBeforeSince(cu("2026-09-01T10:00:00", "2026-10-10"), "2026-11-02") === true);
ok("기준일 이후에 들어왔으면 보임(당일 포함)", w.isBeforeSince(cu("2026-11-02T00:00:00", "2026-11-02"), "2026-11-02") === false);
ok("옛 고객이라도 기준일 이후 활동이 있으면 보임(재문의·기록)", w.isBeforeSince(cu("2026-05-01", "2026-11-10"), "2026-11-02") === false);
ok("기준일이 없으면 아무도 숨기지 않음", w.isBeforeSince(cu("2020-01-01", "2020-01-01"), null) === false);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
