"use client";

import * as React from "react";

import { UNASSIGNED } from "@/lib/sales-reps";
import type { Customer } from "@/lib/types";

// 시트 연동 모드의 리드 데이터. 서버(/api/leads)가 시트를 읽어 준 것을 화면에 올리고,
// 30초마다·창이 다시 보일 때마다 새로 확인한다. 쓰기는 먼저 화면에 반영한 뒤 서버에 보내고,
// 시트가 거절하면 되돌린다. 구글 설정이 없으면 status가 "off"가 되어 기존 CSV 방식으로 동작한다.

export type SheetStatus = "checking" | "off" | "login" | "loading" | "ready" | "error";
export type Notice = { kind: "error" | "info"; text: string; source?: "load" | "write" }; // load: 조회 실패(복구되면 자동으로 사라짐)

const POLL_MS = 30_000;

const REASON_TEXT: Record<string, string> = {
  conflict: "시트에서 다른 사람이 먼저 바꿨습니다",
  row_moved: "시트의 행이 바뀌었습니다(정렬·삭제·삽입)",
  formula: "수식이 들어 있는 칸이라 쓸 수 없습니다",
  not_found: "시트에서 이 문의를 찾지 못했습니다",
  not_writable: "쓸 수 없는 칸입니다",
  login: "다시 로그인해 주세요",
};
const CODE_TEXT: Record<string, string> = {
  unauthorized: "시트 연결 토큰이 맞지 않습니다(설정 확인 필요)",
  unreachable: "시트 서버에 연결하지 못했습니다",
  upstream: "시트 서버가 오류를 돌려줬습니다",
  parse: "시트 형식을 읽지 못했습니다(헤더 확인 필요)",
  no_header: "시트에서 헤더 행을 찾지 못했습니다",
  bad_response: "시트 응답이 올바르지 않습니다",
  not_configured: "시트 연동 설정이 없습니다",
};

type ListResponse = {
  user: string;
  customers: Customer[];
  meta: Record<string, { row: number }>;
  fetchedAt: string;
  sheetUrl: string;
  gid: number;
};

export function useSheetLeads() {
  const [status, setStatus] = React.useState<SheetStatus>("checking");
  const [user, setUser] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [meta, setMeta] = React.useState<Record<string, { row: number }>>({});
  const [sheetUrl, setSheetUrl] = React.useState("");
  const [gid, setGid] = React.useState(0);
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const etag = React.useRef<string | null>(null);
  const pending = React.useRef(0); // 쓰기가 진행 중이면 갱신 결과를 화면에 적용하지 않는다
  const hasData = React.useRef(false);

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
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setNotice({ kind: "error", source: "load", text: CODE_TEXT[data.code ?? ""] ?? "시트를 불러오지 못했습니다" });
        return setStatus(hasData.current ? "ready" : "error");
      }
      const data = (await res.json()) as ListResponse;
      if (pending.current > 0) return; // 쓰기 중에 받은 값은 낡았을 수 있다. 쓰기가 끝나면 다시 불러온다.
      etag.current = res.headers.get("ETag");
      hasData.current = true;
      setUser(data.user);
      setCustomers(data.customers);
      setMeta(data.meta);
      setSheetUrl(data.sheetUrl);
      setGid(data.gid);
      setFetchedAt(data.fetchedAt);
      setNotice((n) => (n?.source === "load" ? null : n));
      setStatus("ready");
    } catch {
      setNotice({ kind: "error", source: "load", text: "서버에 연결하지 못했습니다" });
      setStatus(hasData.current ? "ready" : "error");
    }
  }, []);

  // 처음에 설정 여부와 로그인 상태를 확인한다.
  React.useEffect(() => {
    let alive = true;
    fetch("/api/leads/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { configured?: boolean; user?: string | null }) => {
        if (!alive) return;
        if (!s.configured) return setStatus("off");
        if (!s.user) return setStatus("login");
        setUser(s.user);
        setStatus("loading");
        void load("now");
      })
      .catch(() => alive && setStatus("off"));
    return () => {
      alive = false;
    };
  }, [load]);

  // 보이는 동안 30초마다, 그리고 창이 다시 보이거나 포커스를 받을 때 새로 확인한다.
  React.useEffect(() => {
    if (status !== "ready") return;
    const tick = () => document.visibilityState === "visible" && void load();
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [status, load]);

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
    async (path: string, body: Record<string, unknown>, ids: string[], apply: (c: Customer) => Customer) => {
      const target = new Set(ids);
      const before = new Map(customers.filter((c) => target.has(c.id)).map((c) => [c.id, c]));
      pending.current++;
      setNotice(null);
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
        }
      } catch (e) {
        setCustomers((prev) => prev.map((c) => (before.has(c.id) ? (before.get(c.id) as Customer) : c)));
        const code = e instanceof Error ? e.message : "";
        setNotice({ kind: "error", source: "write", text: `시트에 쓰지 못했습니다 — ${CODE_TEXT[code] ?? REASON_TEXT[code] ?? "잠시 뒤에 다시 시도해 주세요"}` });
      } finally {
        pending.current--;
        await load("now");
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

  const convert = React.useCallback(
    (id: string) => write("/api/leads/convert", { id }, [id], (c) => ({ ...c, stage: "won" as const })),
    [write]
  );

  return {
    status, user, customers, meta, sheetUrl, gid, fetchedAt, refreshing, notice,
    dismissNotice: () => setNotice(null),
    refresh, login, logout, assign, convert,
  };
}
