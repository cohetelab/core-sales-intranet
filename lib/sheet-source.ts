import "server-only";

import { createHash } from "node:crypto";

import { CLOSE_NOTE_TYPE, reasonNote, type CloseReason } from "@/lib/lead-cleanup";
import { CONSULT_LIMIT, FIELD_COLUMN, FIELD_KEYS, STAGE_SHEET_VALUE, stageChangeLine, typedNoteLine, type FieldKey } from "@/lib/lead-fields";
import { parseInquiryRows, recordToCustomer, type LeadRecord, type MissingColumn } from "@/lib/lead-sheet";
import { RETOUCH_NEXT_ACTION } from "@/lib/lead-retouch";
import { UNASSIGNED } from "@/lib/sales-reps";
import type { Customer, DealStage } from "@/lib/types";

// 문의 시트와의 연결부. 지금은 시트에 붙인 Apps Script 웹 앱(integrations/sheet-bridge)을 호출한다.
// 나중에 서비스 계정 방식으로 바꿀 때는 이 파일의 call()만 바꾸면 되고, 아래의 읽기·정리·쓰기 규칙은 그대로 쓴다.

const TIMEOUT_MS = 25_000;
const CACHE_MS = 10_000; // 화면이 캐시 설정 없이 물을 때
const BURST_MS = 2_000; // 화면이 최신을 요청할 때도 여러 명이 동시에 누르면 시트를 한 번만 읽는다
const MAX_ROWS = 50_000;
const CHUNK = 900; // Apps Script 한 번의 쓰기 요청 상한(1000)보다 작게

export class SheetError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

// 운영에서는 구글 Apps Script 주소만 허용한다(서버가 임의의 주소를 호출하게 되는 것을 막는다). 로컬 개발에서는 localhost도 허용.
function scriptUrl() {
  try {
    const u = new URL(process.env.SHEET_SCRIPT_URL ?? "");
    const google = u.protocol === "https:" && /(^|\.)script\.google(usercontent)?\.com$/.test(u.hostname);
    const local = process.env.NODE_ENV !== "production" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    return google || local ? u.toString() : null;
  } catch {
    return null;
  }
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = scriptUrl();
  if (!url || !process.env.SHEET_SCRIPT_TOKEN) throw new SheetError("not_configured");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: process.env.SHEET_SCRIPT_TOKEN, ...body }),
      redirect: "follow", // Apps Script 웹 앱은 응답을 다른 주소로 한 번 넘겨 준다
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SheetError("unreachable");
  }
  if (!res.ok) throw new SheetError("upstream", `HTTP ${res.status}`);
  // 구글이 JSON이 아니라 HTML(로그인 요청·오류 화면)을 돌려주면 웹 앱 배포 설정(액세스: 모든 사용자)이나 URL이 잘못된 것이다.
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || data.ok !== true) {
    const detail = typeof data?.message === "string" ? data.message.slice(0, 160) : undefined;
    throw new SheetError(typeof data?.error === "string" ? data.error : "bad_response", detail);
  }
  return data;
}

export type Snapshot = {
  customers: Customer[];
  // 고객 id → 시트에서 가장 최근 문의 행(시트에서 보기 링크용)과 그 행의 수기 칸 원문(기록 폼의 기준값)
  meta: Record<string, { row: number; raw: Partial<Record<FieldKey, string>> }>;
  records: Map<string, LeadRecord>; // 서버 안에서만 쓴다(쓰기 때 행 확인)
  missing: MissingColumn[]; // 시트 맨 윗줄에서 찾지 못한 칸
  fetchedAt: string;
  sheetUrl: string;
  gid: number;
  etag: string;
};

let cache: { at: number; value: Snapshot } | null = null;

// fresh: 캐시 없이 항상 새로 읽기(쓰기 직전). maxAgeMs: 이 시간보다 오래된 캐시만 버린다.
export async function getSnapshot(options: { fresh?: boolean; maxAgeMs?: number } = {}): Promise<Snapshot> {
  const maxAge = options.fresh ? 0 : (options.maxAgeMs ?? CACHE_MS);
  if (cache && Date.now() - cache.at < maxAge) return cache.value;

  const data = await call({ action: "read" });
  const values = data.values;
  if (!Array.isArray(values) || values.length > MAX_ROWS || !values.every((r) => Array.isArray(r))) throw new SheetError("bad_response");
  const parsed = parseInquiryRows(values.map((r) => (r as unknown[]).map((c) => String(c ?? ""))), true);
  if (!parsed.ok) throw new SheetError("parse", parsed.error);

  const fetchedAt = new Date().toISOString();
  const records = new Map(parsed.records.map((r) => [r.id, r]));
  const customers = parsed.records.map((r) => recordToCustomer(r, fetchedAt));
  const meta: Snapshot["meta"] = {};
  for (const r of parsed.records) {
    const last = r.rowRefs[r.rowRefs.length - 1];
    const raw: Partial<Record<FieldKey, string>> = {};
    for (const k of FIELD_KEYS) if (last?.raw[k]?.trim()) raw[k] = last.raw[k];
    meta[r.id] = { row: last?.row ?? 0, raw };
  }
  const sheetUrl = typeof data.sheetUrl === "string" ? data.sheetUrl : "";
  const gid = typeof data.gid === "number" ? data.gid : 0;
  const etag = createHash("sha1").update(JSON.stringify(customers)).update(JSON.stringify(meta)).update(JSON.stringify(parsed.missing)).update(sheetUrl).digest("hex").slice(0, 20);

  const value: Snapshot = { customers, meta, records, missing: parsed.missing, fetchedAt, sheetUrl, gid, etag };
  cache = { at: Date.now(), value };
  return value;
}

export const SNAPSHOT_BURST_MS = BURST_MS;

export const invalidateSnapshot = () => {
  cache = null;
};

// detail: 시트가 값을 거절했을 때 그 칸에 허용된 값 목록(예: "리드, 상담, 제안")
export type WriteResult = Record<string, { ok: boolean; reason?: string; detail?: string }>;

type BridgeResult = { index: number; ok: boolean; reason?: string; allowed?: unknown };
const allowedText = (v: unknown) => (Array.isArray(v) && v.length ? v.map(String).join(", ").slice(0, 200) : undefined);

type CellUpdate = { row: number; stamp: string; phone: string; col: string; expect: string; value: string };

// 고객 1명은 시트의 여러 문의 행일 수 있다. 같은 값을 그 고객의 모든 행의 해당 칸에 쓴다.
async function writeColumn(ids: string[], col: "담당자" | "단계", value: string, user: string): Promise<WriteResult> {
  const snap = await getSnapshot({ fresh: true }); // 쓰기 직전에 시트를 새로 읽는다
  const results: WriteResult = {};
  const updates: OwnedUpdate[] = [];

  for (const id of ids) {
    const rec = snap.records.get(id);
    if (!rec || rec.rowRefs.length === 0) {
      results[id] = { ok: false, reason: "not_found" };
      continue;
    }
    results[id] = { ok: true };
    for (const ref of rec.rowRefs) {
      const current = col === "담당자" ? ref.owner : ref.stage;
      if (current.trim() === value) continue; // 이미 같은 값
      updates.push({ owner: id, row: ref.row, stamp: ref.stamp, phone: ref.phone, col, expect: current, value });
    }
    // 단계를 옮기면 가장 최근 행의 상담 내용에 "(단계) 이전 → 새 단계" 줄을 남긴다(히스토리 타임라인에 보인다).
    const latest = rec.rowRefs[rec.rowRefs.length - 1];
    if (col === "단계" && latest && latest.stage.trim() !== value) {
      const note = appendConsult(latest, [stageChangeLine(user, latest.stage, value)]);
      if (note) updates.push({ owner: id, note: true, ...note });
    }
  }

  try {
    await sendUpdates(updates, user, results);
  } finally {
    invalidateSnapshot();
  }
  return results;
}

type OwnedUpdate = CellUpdate & { owner: string; note?: boolean };
type RowRef = LeadRecord["rowRefs"][number];

// 가장 최근 문의 행의 '1차 상담 내용' 끝에 줄을 이어 붙이는 업데이트. 5000자를 넘으면 만들지 않는다(null).
function appendConsult(latest: RowRef, lines: string[]): CellUpdate | null {
  const existing = latest.raw.consult ?? "";
  const value = `${existing.trim() ? `${existing.trim()}\n` : ""}${lines.join("\n")}`;
  if (value.length > CONSULT_LIMIT) return null;
  return { row: latest.row, stamp: latest.stamp, phone: latest.phone, col: FIELD_COLUMN.consult, expect: existing, value };
}

export const assignOwners = (ids: string[], owner: string, user: string) =>
  writeColumn(ids, "담당자", owner === UNASSIGNED ? "" : owner, user);

export const setContract = (ids: string[], user: string) => writeColumn(ids, "단계", STAGE_SHEET_VALUE.won, user);

// 파이프라인에서 카드를 옮길 때: 그 고객의 모든 문의 행의 '단계' 칸을 단계에 맞는 글자로 바꾼다(리드는 비움).
export const setStage = (ids: string[], stage: DealStage, user: string) => writeColumn(ids, "단계", STAGE_SHEET_VALUE[stage], user);

const CLOSED = "실패/종료";

// 쓰기 업데이트를 묶음(CHUNK)으로 나눠 보내고, 고객별 결과로 모은다. note 업데이트(종료 사유 기록)가 실패해도 종료 자체는 성공으로 둔다.
async function sendUpdates(updates: (CellUpdate & { owner: string; note?: boolean })[], user: string, results: WriteResult) {
  for (let i = 0; i < updates.length; i += CHUNK) {
    const part = updates.slice(i, i + CHUNK);
    const data = await call({ action: "update", user, updates: part.map((u) => ({ row: u.row, stamp: u.stamp, phone: u.phone, col: u.col, expect: u.expect, value: u.value })) });
    const list = Array.isArray(data.results) ? (data.results as BridgeResult[]) : [];
    for (const r of list) {
      const u = part[r.index];
      if (u && !r.ok && !u.note && results[u.owner]?.ok) results[u.owner] = { ok: false, reason: r.reason ?? "failed", detail: allowedText(r.allowed) };
    }
  }
}

// 종료 처리: 그 고객의 모든 문의 행의 '단계' 칸을 '실패/종료'로 바꾼다. 사유를 고르면 가장 최근 행의 상담 내용에
// "[날짜 시각 이름] (메모) 종료 사유: 무응답" 줄을 이어서 남긴다(시트에 사유 칸이 없어서).
export async function closeCustomers(ids: string[], reason: CloseReason | null, user: string): Promise<WriteResult> {
  const snap = await getSnapshot({ fresh: true });
  const results: WriteResult = {};
  const updates: OwnedUpdate[] = [];
  const line = reason ? typedNoteLine(user, reasonNote(reason), CLOSE_NOTE_TYPE) : "";

  for (const id of ids) {
    const rec = snap.records.get(id);
    if (!rec || rec.rowRefs.length === 0) {
      results[id] = { ok: false, reason: "not_found" };
      continue;
    }
    results[id] = { ok: true };
    for (const ref of rec.rowRefs) {
      if (/실패|종료/.test(ref.stage)) continue; // 이미 종료로 표시된 행
      updates.push({ owner: id, row: ref.row, stamp: ref.stamp, phone: ref.phone, col: "단계", expect: ref.stage, value: CLOSED });
    }
    const latest = rec.rowRefs[rec.rowRefs.length - 1];
    if (latest) {
      // 단계 줄(이전 → 실패/종료) 다음에 사유 줄을 이어서 남긴다. 둘을 한 번에 붙여서 같은 칸에 두 번 쓰지 않는다.
      const lines = [...(/실패|종료/.test(latest.stage) ? [] : [stageChangeLine(user, latest.stage, CLOSED)]), ...(line ? [line] : [])];
      const note = lines.length ? appendConsult(latest, lines) : null;
      if (note) updates.push({ owner: id, note: true, ...note });
    }
  }
  try {
    await sendUpdates(updates, user, results);
  } finally {
    invalidateSnapshot();
  }
  return results;
}

// 종료 해제: '실패/종료'로 표시된 행의 '단계' 칸만 비운다(다른 단계가 적힌 행은 건드리지 않는다).
export async function reopenCustomers(ids: string[], user: string): Promise<WriteResult> {
  const snap = await getSnapshot({ fresh: true });
  const results: WriteResult = {};
  const updates: OwnedUpdate[] = [];
  for (const id of ids) {
    const rec = snap.records.get(id);
    if (!rec || rec.rowRefs.length === 0) {
      results[id] = { ok: false, reason: "not_found" };
      continue;
    }
    results[id] = { ok: true };
    for (const ref of rec.rowRefs) {
      if (!/실패|종료/.test(ref.stage)) continue;
      updates.push({ owner: id, row: ref.row, stamp: ref.stamp, phone: ref.phone, col: "단계", expect: ref.stage, value: "" });
    }
    const latest = rec.rowRefs[rec.rowRefs.length - 1];
    if (latest && /실패|종료/.test(latest.stage)) {
      const note = appendConsult(latest, [stageChangeLine(user, latest.stage, "")]);
      if (note) updates.push({ owner: id, note: true, ...note });
    }
  }
  try {
    await sendUpdates(updates, user, results);
  } finally {
    invalidateSnapshot();
  }
  return results;
}

// 리터치 풀 배정: 묵은 고객을 영업에게 다시 배정한다. 모든 문의 행의 '담당자'를 바꾸고, 종료된 고객은 reopen이 켜져 있으면 '단계'를 비워 되살린다.
// 가장 최근 행의 상담 내용에 "(단계) 실패/종료 → 리드"(되살릴 때)와 "(메모) 리터치 풀 배정 → Ian" 줄을 남기고, '다음 액션 플랜'이 비어 있으면 채운다.
// 줄·다음 액션 기록이 실패해도(충돌·길이) 배정 자체는 성공으로 둔다.
export async function retouchAssign(ids: string[], owner: string, reopen: boolean, user: string): Promise<WriteResult> {
  const snap = await getSnapshot({ fresh: true });
  const results: WriteResult = {};
  const updates: OwnedUpdate[] = [];
  const who = owner.match(/\(([^)]+)\)/)?.[1] ?? owner;
  const isClosed = (stage: string) => /실패|종료/.test(stage);
  for (const id of ids) {
    const rec = snap.records.get(id);
    if (!rec || rec.rowRefs.length === 0) {
      results[id] = { ok: false, reason: "not_found" };
      continue;
    }
    results[id] = { ok: true };
    for (const ref of rec.rowRefs) {
      if (ref.owner.trim() !== owner) updates.push({ owner: id, row: ref.row, stamp: ref.stamp, phone: ref.phone, col: "담당자", expect: ref.owner, value: owner });
      if (reopen && isClosed(ref.stage)) updates.push({ owner: id, row: ref.row, stamp: ref.stamp, phone: ref.phone, col: "단계", expect: ref.stage, value: "" });
    }
    const latest = rec.rowRefs[rec.rowRefs.length - 1];
    const lines = [...(reopen && isClosed(latest.stage) ? [stageChangeLine(user, latest.stage, "")] : []), typedNoteLine(user, `리터치 풀 배정 → ${who}`, "메모")];
    const note = appendConsult(latest, lines);
    if (note) updates.push({ owner: id, note: true, ...note });
    const nextAction = latest.raw.nextAction ?? "";
    if (!nextAction.trim()) {
      updates.push({ owner: id, note: true, row: latest.row, stamp: latest.stamp, phone: latest.phone, col: FIELD_COLUMN.nextAction, expect: nextAction, value: RETOUCH_NEXT_ACTION });
    }
  }
  try {
    await sendUpdates(updates, user, results);
  } finally {
    invalidateSnapshot();
  }
  return results;
}

export type FieldResult = { ok: boolean; reason?: string; detail?: string };

// 상담 기록처럼 고객의 "가장 최근 문의 행"에 쓰는 칸들. base는 사용자가 폼을 열었을 때 보던 칸의 원문이다.
// 쓰는 순간 시트의 칸이 base와 다르면(그 사이 누가 고쳤으면) 덮어쓰지 않고 conflict로 돌려준다.
export async function writeFields(
  id: string,
  changes: Partial<Record<FieldKey, string>>,
  base: Partial<Record<FieldKey, string>> | null,
  user: string
): Promise<Record<string, FieldResult>> {
  const snap = await getSnapshot({ fresh: true });
  const rec = snap.records.get(id);
  const ref = rec?.rowRefs[rec.rowRefs.length - 1];
  const results: Record<string, FieldResult> = {};
  if (!rec || !ref) {
    for (const k of Object.keys(changes)) results[k] = { ok: false, reason: "not_found" };
    return results;
  }
  const updates: CellUpdate[] = [];
  const keys: FieldKey[] = [];
  for (const k of FIELD_KEYS) {
    const value = changes[k];
    if (value === undefined) continue;
    const current = ref.raw[k] ?? "";
    const expect = base ? (base[k] ?? "") : current;
    if (value.trim() === current.trim() && expect.trim() === current.trim()) {
      results[k] = { ok: true }; // 이미 같은 값
      continue;
    }
    updates.push({ row: ref.row, stamp: ref.stamp, phone: ref.phone, col: FIELD_COLUMN[k], expect, value });
    keys.push(k);
  }
  try {
    if (updates.length) {
      const data = await call({ action: "update", user, updates });
      const list = Array.isArray(data.results) ? (data.results as { index: number; ok: boolean; reason?: string }[]) : [];
      for (const r of list) results[keys[r.index]] = r.ok ? { ok: true } : { ok: false, reason: r.reason ?? "failed" };
    }
  } finally {
    invalidateSnapshot();
  }
  return results;
}
