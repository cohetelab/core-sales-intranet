"use client";

import * as React from "react";

import { FIELD_LABEL, type FieldKey } from "@/lib/lead-fields";
import type { MissingColumn } from "@/lib/lead-sheet";
import { UNASSIGNED } from "@/lib/sales-reps";
import type { Customer, DealStage } from "@/lib/types";

// 시트 연동 모드의 리드 데이터. 서버(/api/leads)가 시트를 읽어 준 것을 화면에 올리고,
// 30초마다·창이 다시 보일 때마다 새로 확인한다. 쓰기는 먼저 화면에 반영한 뒤 서버에 보내고,
// 시트가 거절하면 되돌린다. 구글 설정이 없으면 status가 "off"가 되어 기존 CSV 방식으로 동작한다.

export type SheetStatus = "checking" | "off" | "login" | "loading" | "ready" | "error";
export type Notice = { kind: "error" | "info"; text: string; source?: "load" | "write" }; // load: 조회 실패(복구되면 자동으로 사라짐)

const POLL_MS = 30_000;
const CSV_MODE_KEY = "core-sales-leads-csv-mode";

const REASON_TEXT: Record<string, string> = {
  conflict: "시트에서 다른 사람이 먼저 바꿨습니다",
  row_moved: "시트의 행이 바뀌었습니다(정렬·삭제·삽입)",
  formula: "수식이 들어 있는 칸이라 쓸 수 없습니다",
  not_found: "시트에서 이 문의를 찾지 못했습니다",
  not_writable: "쓸 수 없는 칸입니다",
  login: "다시 로그인해 주세요",
};
// 서버가 알려 준 오류를 사람이 읽는 문구 + (원인 코드: 설명)으로 만든다. 코드가 없으면 HTTP 상태를 보여 준다.
function describeError(fallback: string, status: number, data: { code?: string; detail?: string }) {
  const base = CODE_TEXT[data.code ?? ""] ?? fallback;
  const tag = data.code ? `${data.code}${data.detail ? `: ${data.detail}` : ""}` : `HTTP ${status}`;
  return `${base} (${tag})`;
}

const CODE_TEXT: Record<string, string> = {
  unauthorized: "시트 연결 토큰이 맞지 않습니다(설정 확인 필요)",
  unreachable: "시트 서버에 연결하지 못했습니다",
  upstream: "시트 서버가 오류를 돌려줬습니다",
  parse: "시트 형식을 읽지 못했습니다(헤더 확인 필요)",
  no_header: "시트에서 헤더 행을 찾지 못했습니다",
  bad_response: "시트 서버가 데이터를 돌려주지 않았습니다 — 웹 앱 배포의 액세스가 '모든 사용자'인지, 주소가 /exec 로 끝나는지 확인하세요",
  server_error: "시트 스크립트에서 오류가 났습니다",
  not_configured: "시트 연동 설정이 없습니다",
};

// 시트에서 가장 최근 문의 행 번호와 그 행의 수기 칸 원문(기록 폼의 기준값)
export type LeadMeta = { row: number; raw: Partial<Record<FieldKey, string>> };

type ListResponse = {
  user: string;
  customers: Customer[];
  meta: Record<string, LeadMeta>;
  missing?: MissingColumn[];
  fetchedAt: string;
  sheetUrl: string;
  gid: number;
};

// 앱 전체가 공유하는 상태(components/sheet-leads-provider.tsx). active는 이 데이터를 보는 화면이 하나라도 있다는 뜻이고,
// 그때만 로그인 확인과 30초 갱신을 한다(다른 화면에서는 시트를 건드리지 않는다).
export function useSheetLeadsState(active: boolean) {
  const [status, setStatus] = React.useState<SheetStatus>("checking");
  // CSV 방식: 구글 시트 연동이 설정돼 있어도 시트를 CSV 파일로 내려받아 올려서 쓸 수 있다(선택은 이 브라우저에 기억한다).
  const [csvMode, setCsvModeState] = React.useState(false);
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCsvModeState(window.localStorage.getItem(CSV_MODE_KEY) === "1");
    } catch {
      // 저장소를 못 쓰면 기본값(구글 연동)으로 둔다
    }
  }, []);
  const setCsvMode = React.useCallback((on: boolean) => {
    setCsvModeState(on);
    try {
      if (on) window.localStorage.setItem(CSV_MODE_KEY, "1");
      else window.localStorage.removeItem(CSV_MODE_KEY);
    } catch {
      // 무시
    }
  }, []);
  const [user, setUser] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [meta, setMeta] = React.useState<Record<string, LeadMeta>>({});
  const [missing, setMissing] = React.useState<MissingColumn[]>([]);
  const [sheetUrl, setSheetUrl] = React.useState("");
  const [gid, setGid] = React.useState(0);
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  // 시트에 쓰는 중인 고객과, 마지막으로 시트에 저장된 시각(화면에 "저장 중/저장됨"을 보여 주는 용도)
  const [savingIds, setSavingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const etag = React.useRef<string | null>(null);
  const pending = React.useRef(0); // 쓰기가 진행 중이면 갱신 결과를 화면에 적용하지 않는다
  const hasData = React.useRef(false);
  const checked = React.useRef(false); // 로그인 확인은 앱을 연 뒤 처음 필요할 때 한 번만

  // poll: 주기적 확인(바뀐 게 없으면 304). now: 쓰기 직후·새로고침·로그인(서버 캐시도 건너뛰고 항상 새로 읽는다)
  const load = React.useCallback(async (mode: "poll" | "now" = "poll") => {
    try {
      const headers: Record<string, string> = {};
      if (etag.current && mode === "poll") headers["If-None-Match"] = etag.current;
      const res = await fetch(mode === "now" ? "/api/leads?fresh=1&nocache=1" : "/api/leads?fresh=1", { cache: "no-store", headers });
      if (res.status === 503) return setStatus("off");
      if (res.status === 401) {
        setUser(null);
        return setStatus("login");
      }
      if (res.status === 304) {
        setFetchedAt(new Date().toISOString());
        setNotice((n) => (n?.source === "load" ? null : n));
        return setStatus("ready");
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
        setNotice({ kind: "error", source: "load", text: describeError("시트를 불러오지 못했습니다", res.status, data) });
        return setStatus(hasData.current ? "ready" : "error");
      }
      const data = (await res.json()) as ListResponse;
      if (pending.current > 0) return; // 쓰기 중에 받은 값은 낡았을 수 있다. 쓰기가 끝나면 다시 불러온다.
      etag.current = res.headers.get("ETag");
      hasData.current = true;
      setUser(data.user);
      setCustomers(data.customers);
      setMeta(data.meta);
      setMissing(data.missing ?? []);
      setSheetUrl(data.sheetUrl);
      setGid(data.gid);
      setFetchedAt(data.fetchedAt);
      setNotice((n) => (n?.source === "load" ? null : n));
      setStatus("ready");
      return data;
    } catch {
      setNotice({ kind: "error", source: "load", text: "서버에 연결하지 못했습니다" });
      setStatus(hasData.current ? "ready" : "error");
    }
  }, []);

  // 이 데이터를 보는 화면이 처음 열릴 때 설정 여부와 로그인 상태를 확인한다.
  React.useEffect(() => {
    if (!active || checked.current) return;
    checked.current = true;
    fetch("/api/leads/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { configured?: boolean; user?: string | null }) => {
        if (!s.configured) return setStatus("off");
        if (!s.user) return setStatus("login");
        setUser(s.user);
        setStatus("loading");
        void load("now");
      })
      .catch(() => setStatus("off"));
  }, [active, load]);

  // 보이는 동안 30초마다, 그리고 창이 다시 보이거나 포커스를 받을 때 새로 확인한다.
  React.useEffect(() => {
    if (!active || status !== "ready") return;
    const tick = () => document.visibilityState === "visible" && void load();
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, status, load]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    await load("now");
    setRefreshing(false);
  }, [load]);

  const login = React.useCallback(
    async (passcode: string, name: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/leads/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passcode, name }),
        });
        if (res.ok) {
          setUser(name);
          setStatus("loading");
          await load("now");
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

  const logout = React.useCallback(async () => {
    await fetch("/api/leads/session", { method: "DELETE" }).catch(() => undefined);
    etag.current = null;
    hasData.current = false;
    setCustomers([]);
    setUser(null);
    setStatus("login");
  }, []);

  // 시트에 쓰는 공통 처리: 화면에 먼저 반영 → 서버 → 거절된 고객만 되돌리기 → 시트 다시 읽기
  const write = React.useCallback(
    async (path: string, body: Record<string, unknown>, ids: string[], apply: (c: Customer) => Customer): Promise<Record<string, unknown> | null> => {
      const target = new Set(ids);
      const before = new Map(customers.filter((c) => target.has(c.id)).map((c) => [c.id, c]));
      pending.current++;
      setNotice(null);
      setSavingIds((prev) => new Set([...prev, ...target]));
      setCustomers((prev) => prev.map((c) => (target.has(c.id) ? apply(c) : c)));
      try {
        const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = (await res.json().catch(() => ({}))) as { results?: Record<string, { ok: boolean; reason?: string }>; error?: string; code?: string };
        if (res.status === 401) {
          setStatus("login");
          throw new Error("login");
        }
        if (!res.ok || !data.results) throw new Error(data.code ?? data.error ?? "failed");
        const failed = Object.entries(data.results).filter(([, r]) => !r.ok);
        if (failed.length) {
          const failedIds = new Set(failed.map(([id]) => id));
          setCustomers((prev) => prev.map((c) => (failedIds.has(c.id) ? (before.get(c.id) ?? c) : c)));
          const reasons = Array.from(new Set(failed.map(([, r]) => REASON_TEXT[r.reason ?? ""] ?? "시트에 반영하지 못했습니다")));
          setNotice({ kind: "error", source: "write", text: `${failed.length}건을 시트에 쓰지 못했습니다 — ${reasons.join(" · ")}` });
        } else {
          setSavedAt(new Date().toISOString());
        }
        return data as Record<string, unknown>;
      } catch (e) {
        setCustomers((prev) => prev.map((c) => (before.has(c.id) ? (before.get(c.id) as Customer) : c)));
        const code = e instanceof Error ? e.message : "";
        setNotice({ kind: "error", source: "write", text: `시트에 쓰지 못했습니다 — ${CODE_TEXT[code] ?? REASON_TEXT[code] ?? "잠시 뒤에 다시 시도해 주세요"}` });
        return null;
      } finally {
        pending.current--;
        await load("now");
        setSavingIds((prev) => {
          const next = new Set(prev);
          target.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [customers, load]
  );

  const assign = React.useCallback(
    (ids: string[], owner: string) =>
      write("/api/leads/assign", { ids, owner }, ids, (c) => ({
        ...c,
        owner,
        nextStep:
          c.nextStep === "담당자 배정 필요" && owner !== UNASSIGNED
            ? "첫 컨택 필요"
            : c.nextStep === "첫 컨택 필요" && owner === UNASSIGNED
              ? "담당자 배정 필요"
              : c.nextStep,
      })),
    [write]
  );

  // 계약 전환(선택: 계약 금액). 단계는 모든 문의 행에, 금액은 가장 최근 행에 기록된다.
  const convert = React.useCallback(
    async (id: string, amount?: number) => {
      const data = await write("/api/leads/convert", amount ? { id, amount } : { id }, [id], (c) => ({ ...c, stage: "won" as const }));
      const contract = data?.contract as { ok: boolean; reason?: string } | undefined;
      if (contract && !contract.ok) {
        setNotice({ kind: "error", source: "write", text: `계약으로 전환했지만 계약 금액은 쓰지 못했습니다 — ${REASON_TEXT[contract.reason ?? ""] ?? "시트에 반영하지 못했습니다"}` });
      }
    },
    [write]
  );

  // 파이프라인에서 카드를 다른 단계로 옮긴다. 시트의 '단계' 칸(그 고객의 모든 문의 행)에 기록된다.
  const moveStage = React.useCallback(
    async (id: string, stage: DealStage) => {
      await write("/api/leads/stage", { id, stage }, [id], (c) => ({ ...c, stage }));
    },
    [write]
  );

  // 상담 기록: 폼을 열었을 때의 칸 원문(base)과 함께 보낸다. 그 사이 시트에서 바뀐 칸은 덮어쓰지 않고 알려 준다.
  const record = React.useCallback(
    async (
      id: string,
      changes: Partial<Record<FieldKey, string>>,
      base: Partial<Record<FieldKey, string>>
    ): Promise<{ ok: boolean; message?: string; raw?: Partial<Record<FieldKey, string>> }> => {
      setNotice(null);
      try {
        const res = await fetch("/api/leads/record", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, changes, base }) });
        const data = (await res.json().catch(() => ({}))) as { results?: Record<string, { ok: boolean; reason?: string }>; error?: string; code?: string; field?: string };
        if (res.status === 401) {
          setStatus("login");
          return { ok: false, message: REASON_TEXT.login };
        }
        if (!res.ok || !data.results) {
          if (data.error === "bad_field") return { ok: false, message: `입력값을 확인해 주세요 (${FIELD_LABEL[data.field as FieldKey] ?? data.field})` };
          return { ok: false, message: CODE_TEXT[data.code ?? ""] ?? "시트에 쓰지 못했습니다" };
        }
        const failed = Object.entries(data.results).filter(([, r]) => !r.ok);
        const fresh = await load("now");
        if (failed.length) {
          return {
            ok: false,
            message: failed.map(([k, r]) => `${FIELD_LABEL[k as FieldKey] ?? k}: ${REASON_TEXT[r.reason ?? ""] ?? "반영하지 못했습니다"}`).join(" · "),
          };
        }
        return { ok: true, raw: fresh?.meta[id]?.raw };
      } catch {
        return { ok: false, message: "서버에 연결하지 못했습니다" };
      }
    },
    [load]
  );

  return {
    status, user, customers, meta, missing, sheetUrl, gid, fetchedAt, refreshing, notice, csvMode, setCsvMode, savingIds, savedAt,
    dismissNotice: () => setNotice(null),
    refresh, login, logout, assign, convert, moveStage, record,
  };
}
