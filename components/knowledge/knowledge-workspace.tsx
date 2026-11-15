"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { JSONContent } from "@tiptap/react";
import { FileText, Folder, FolderPlus, LogOut, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { KnowledgeEditor, emptyDocument } from "./knowledge-editor";
import { KnowledgeConnections } from "./knowledge-connections";
import "./knowledge.css";

type Config = { url: string; key: string } | null;
type FolderRow = { id: string; parent_id: string | null; name: string; created_at: string; deleted_at: string | null };
type DocumentRow = { id: string; folder_id: string | null; title: string; body: JSONContent; body_text: string; version: number; created_by: string; updated_by: string; created_at: string; updated_at: string; deleted_at: string | null };
type Workspace = { folders: FolderRow[]; documents: DocumentRow[]; email: string };
type Draft = { id: string; title: string; body: JSONContent; text: string; version: number };

const shell = "rounded-2xl border border-neutral-200 bg-white shadow-sm";
const smallButton = "inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50";

export function KnowledgeWorkspace({ config }: { config: Config }) {
  const supabase = useMemo(() => config ? createBrowserClient(config.url, config.key) : null, [config]);
  const [authReady, setAuthReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [data, setData] = useState<Workspace | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [query, setQuery] = useState("");
  const [trash, setTrash] = useState(false);
  const [message, setMessage] = useState("");
  const [linkRequest, setLinkRequest] = useState<{ text: string; sequence: number } | null>(null);
  const savingRef = useRef(false);
  const draftRef = useRef<Draft | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/knowledge/workspace", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "불러오지 못했습니다."); setData(null); return; }
    setData(body as Workspace);
    setMessage("");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getUser().then(({ data: result }) => {
      if (!alive) return;
      setLoggedIn(Boolean(result.user));
      setAuthReady(true);
      if (result.user) void refresh();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session?.user));
      if (!session) { setData(null); setSelectedId(null); setDraft(null); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase, refresh]);

  const action = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/knowledge/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || "처리하지 못했습니다."), { status: response.status });
    return body;
  };

  const save = useCallback(async () => {
    const current = draftRef.current;
    if (!current || !dirtyRef.current || savingRef.current || conflictRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await action({ op: "saveDocument", id: current.id, title: current.title || "제목 없음", body: current.body, bodyText: current.text, version: current.version });
      const saved = result.item as DocumentRow;
      setData((previous) => previous ? { ...previous, documents: previous.documents.map((item) => item.id === saved.id ? saved : item) } : previous);
      setDraft((previous) => previous?.id === saved.id ? { ...previous, version: saved.version } : previous);
      if (draftRef.current && draftRef.current.id === current.id && draftRef.current.title === current.title && JSON.stringify(draftRef.current.body) === JSON.stringify(current.body)) {
        dirtyRef.current = false;
        setDirty(false);
      }
      setMessage("");
    } catch (error) {
      if ((error as { status?: number }).status === 409) { conflictRef.current = true; setConflict(true); }
      setMessage((error as Error).message);
    } finally { savingRef.current = false; setSaving(false); }
  }, []);

  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [draft, dirty, conflict, save]);

  const selectDocument = async (item: DocumentRow) => {
    if (dirtyRef.current && !conflictRef.current) await save();
    if (dirtyRef.current && !conflictRef.current) return;
    if (dirtyRef.current && conflictRef.current && !window.confirm("저장되지 않은 내용을 복사한 뒤 다른 문서로 이동하세요. 이동할까요?")) return;
    setSelectedId(item.id);
    setLinkRequest(null);
    setDraft({ id: item.id, title: item.title, body: item.body || emptyDocument, text: item.body_text || "", version: item.version });
    setDirty(false); dirtyRef.current = false;
    setConflict(false); conflictRef.current = false;
    setMessage("");
  };

  const updateDraft = (change: Partial<Draft>) => {
    setDraft((previous) => previous ? { ...previous, ...change } : previous);
    setDirty(true); dirtyRef.current = true;
  };

  const folderPath = useMemo(() => {
    const path: FolderRow[] = [];
    let current = folderId;
    while (current && data && path.length < 30) {
      const found = data.folders.find((folder) => folder.id === current);
      if (!found || path.some((folder) => folder.id === found.id)) break;
      path.unshift(found); current = found.parent_id;
    }
    return path;
  }, [folderId, data]);

  const visibleFolders = data?.folders.filter((folder) => trash ? Boolean(folder.deleted_at) : !folder.deleted_at && (query ? folder.name.toLowerCase().includes(query.toLowerCase()) : folder.parent_id === folderId)) || [];
  const visibleDocuments = data?.documents.filter((item) => trash ? Boolean(item.deleted_at) : !item.deleted_at && (query ? `${item.title} ${item.body_text}`.toLowerCase().includes(query.toLowerCase()) : item.folder_id === folderId)) || [];
  const selected = data?.documents.find((item) => item.id === selectedId);
  const linkDocuments = useMemo(() => (data?.documents || []).map((item) =>
    item.id === draft?.id ? { ...item, title: draft.title, body_text: draft.text } : item
  ), [data?.documents, draft]);

  const run = async (payload: Record<string, unknown>, after?: (item: DocumentRow) => void) => {
    try { const result = await action(payload); await refresh(); if (after && result.item) after(result.item); }
    catch (error) { setMessage((error as Error).message); }
  };

  if (!config) return <main className={`${shell} m-6 max-w-3xl p-8`}>
    <h1 className="text-2xl font-bold">팀 지식창고</h1>
    <p className="mt-3 text-neutral-600">Supabase 공개 키 설정이 필요합니다. 관리자에게 문의하세요.</p>
  </main>;
  if (!authReady) return <div className="p-8 text-neutral-500">지식창고를 여는 중…</div>;
  if (!loggedIn) return <main className="mx-auto mt-12 max-w-md px-4">
    <div className={`${shell} p-8`}>
      <div className="mb-7 text-3xl text-neutral-700">✦</div>
      <h1 className="text-2xl font-bold">팀 지식창고</h1>
      <p className="mt-2 text-sm text-neutral-500">초대받은 직원 계정으로 로그인하세요.</p>
      <form className="mt-8 space-y-4" onSubmit={async (event) => {
        event.preventDefault(); setMessage("");
        const result = await supabase!.auth.signInWithPassword({ email, password });
        if (result.error) setMessage(result.error.message); else void refresh();
      }}>
        <label className="block text-sm font-medium">이메일<input className="mt-2 w-full rounded-lg border p-3" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="block text-sm font-medium">비밀번호<input className="mt-2 w-full rounded-lg border p-3" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="w-full rounded-lg bg-neutral-900 p-3 font-semibold text-white">로그인</button>
      </form>
      {message && <p role="alert" className="mt-4 text-sm text-red-600">{message}</p>}
    </div>
  </main>;

  return <main className="mx-auto w-full min-w-0 max-w-[1500px] p-4 md:p-7">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">팀 지식창고</h1><p className="mt-1 text-sm text-neutral-500">팀이 함께 작성하는 문서함 · 자동 저장</p></div>
      <div className="flex items-center gap-3 text-xs text-neutral-500"><span>{data?.email}</span><button className={smallButton} onClick={async () => { await supabase!.auth.signOut(); setLoggedIn(false); }}><LogOut size={15} /> 로그아웃</button></div>
    </header>
    {message && <div role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}
    {!data ? <button className={smallButton} onClick={() => void refresh()}>다시 불러오기</button> : <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={`${shell} p-4`}>
        <div className="mb-4 flex items-center justify-between"><strong>문서함</strong><button className={smallButton} title="새 폴더" onClick={() => { const name = window.prompt("새 폴더 이름"); if (name?.trim()) void run({ op: "createFolder", name, folderId }); }}><FolderPlus size={16} /></button></div>
        <button className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${!folderId && !trash ? "bg-violet-100 text-violet-800" : "hover:bg-neutral-100"}`} onClick={() => { setFolderId(null); setTrash(false); setQuery(""); }}>전체 문서</button>
        {data.folders.filter((folder) => !folder.deleted_at).map((folder) => <button key={folder.id} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${folderId === folder.id && !trash ? "bg-violet-100 text-violet-800" : "hover:bg-neutral-100"}`} onClick={() => { setFolderId(folder.id); setTrash(false); setQuery(""); }}><Folder size={14} className="mr-2 inline" />{folder.name}</button>)}
        <button className={`mt-5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${trash ? "bg-violet-100 text-violet-800" : "hover:bg-neutral-100"}`} onClick={() => { setTrash(true); setSelectedId(null); setDraft(null); }}><Trash2 size={14} /> 휴지통</button>
        <div className="mt-8 border-t pt-4"><label className="text-xs text-neutral-500">초대받은 직원의 비밀번호 설정</label><div className="mt-2 flex gap-1"><input className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm" type="password" placeholder="새 비밀번호" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button className={smallButton} onClick={async () => { if (newPassword.length < 8) { setMessage("비밀번호는 8자 이상이어야 합니다."); return; } const result = await supabase!.auth.updateUser({ password: newPassword }); setMessage(result.error?.message || "비밀번호를 설정했습니다."); setNewPassword(""); }}>설정</button></div></div>
      </aside>
      <div className="min-w-0 space-y-4">
        <div className={`${shell} p-4`}>
          <div className="flex flex-wrap items-center gap-2"><div className="flex flex-1 items-center gap-2 rounded-lg border px-3"><Search size={16} className="text-neutral-400" /><input className="min-w-0 flex-1 py-2 text-sm outline-none" placeholder="제목과 본문 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{!trash && <button className={smallButton} onClick={() => { const name = window.prompt("새 폴더 이름"); if (name?.trim()) void run({ op: "createFolder", name, folderId }); }}><FolderPlus size={16} /> 폴더</button>}{!trash && <button className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white" onClick={() => void run({ op: "createDocument", folderId }, (item) => void selectDocument(item))}><Plus size={16} /> 새 문서</button>}</div>
          <div className="mt-4 flex flex-wrap items-center gap-1 text-xs text-neutral-500"><button onClick={() => { setFolderId(null); setTrash(false); }}>문서함</button>{folderPath.map((folder) => <span key={folder.id}> / <button onClick={() => setFolderId(folder.id)}>{folder.name}</button></span>)}{trash && <span> / 휴지통</span>}</div>
        </div>
        {!trash && <KnowledgeConnections documents={linkDocuments} selectedId={selected && !selected.deleted_at ? selected.id : null} onOpen={(id) => { const item = data.documents.find((doc) => doc.id === id && !doc.deleted_at); if (item) void selectDocument(item); }} onInsert={(text) => setLinkRequest({ text, sequence: Date.now() })} />}
        <div className="grid gap-4 xl:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
          <div className={`${shell} min-h-[500px] p-3`}><h2 className="px-2 py-2 text-xs font-semibold text-neutral-400">{trash ? "삭제된 항목" : query ? "검색 결과" : "폴더와 문서"}</h2>
            {visibleFolders.map((folder) => <div key={folder.id} className="flex items-center rounded-lg hover:bg-neutral-50"><button className="min-w-0 flex-1 truncate px-2 py-3 text-left text-sm" onClick={() => { if (!trash) { setFolderId(folder.id); setQuery(""); } }}><Folder size={15} className="mr-2 inline text-violet-600" />{folder.name}</button><button className="p-2 text-neutral-400" title={trash ? "복원" : "휴지통으로"} onClick={() => void run({ op: trash ? "restoreFolder" : "trashFolder", id: folder.id })}>{trash ? <RotateCcw size={14} /> : <Trash2 size={14} />}</button></div>)}
            {visibleDocuments.map((item) => <div key={item.id} className={`flex items-center rounded-lg ${selectedId === item.id ? "bg-violet-50" : "hover:bg-neutral-50"}`}><button className="min-w-0 flex-1 px-2 py-3 text-left" onClick={() => void selectDocument(item)}><span className="block truncate text-sm font-medium"><FileText size={15} className="mr-2 inline text-neutral-400" />{item.title}</span><span className="ml-6 text-xs text-neutral-400">{new Date(item.updated_at).toLocaleString("ko-KR")}</span></button><button className="p-2 text-neutral-400" title={trash ? "복원" : "휴지통으로"} onClick={() => void run({ op: trash ? "restoreDocument" : "trashDocument", id: item.id })}>{trash ? <RotateCcw size={14} /> : <Trash2 size={14} />}</button></div>)}
            {!visibleFolders.length && !visibleDocuments.length && <p className="px-2 py-8 text-center text-sm text-neutral-400">{trash ? "휴지통이 비어 있습니다." : "문서가 없습니다."}</p>}
          </div>
          <div className={`${shell} min-h-[500px] p-5 md:p-7`}>{selected && draft ? <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-neutral-400">{conflict ? "저장 충돌" : saving ? "저장 중…" : dirty ? "저장 대기" : `저장됨 · 버전 ${draft.version}`}</span><div className="flex gap-2"><select className={smallButton} value={selected.folder_id || ""} onChange={(event) => void run({ op: "moveDocument", id: selected.id, folderId: event.target.value || null })}><option value="">전체 문서</option>{data.folders.filter((folder) => !folder.deleted_at).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button className={smallButton} onClick={() => void save()} disabled={!dirty || conflict}>저장</button></div></div>
            {conflict && <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>다른 직원이 먼저 저장했습니다.</strong><p className="mt-1">현재 내용은 이 화면에 남아 있습니다. 내용을 복사한 뒤 최신 문서를 불러오세요.</p><div className="mt-3 flex gap-2"><button className={smallButton} onClick={async () => { await navigator.clipboard.writeText(`${draft.title}\n\n${draft.text}`); setMessage("현재 내용을 복사했습니다."); }}>내 내용 복사</button><button className={smallButton} onClick={async () => { const response = await fetch("/api/knowledge/workspace", { cache: "no-store" }); const fresh = (await response.json()).documents?.find((item: DocumentRow) => item.id === draft.id); if (fresh) { setConflict(false); conflictRef.current = false; dirtyRef.current = false; setDirty(false); void selectDocument(fresh); void refresh(); } }}>최신 문서 불러오기</button></div></div>}
            <input className="mb-5 w-full border-none bg-transparent text-3xl font-bold outline-none placeholder:text-neutral-300" value={draft.title === "제목 없음" ? "" : draft.title} placeholder="제목 없음" onChange={(event) => updateDraft({ title: event.target.value })} /><KnowledgeEditor key={draft.id} linkRequest={linkRequest} content={draft.body} onChange={(body, text) => updateDraft({ body, text })} /><p className="mt-5 text-xs text-neutral-400">작성 {new Date(selected.created_at).toLocaleString("ko-KR")} · 수정 {new Date(selected.updated_at).toLocaleString("ko-KR")}</p>
          </> : <div className="flex min-h-[400px] flex-col items-center justify-center text-center"><FileText size={32} className="text-neutral-300" /><h2 className="mt-5 text-lg font-semibold">문서를 선택하세요</h2><p className="mt-2 text-sm text-neutral-500">폴더에서 문서를 열거나 새 문서를 작성할 수 있습니다.</p></div>}</div>
        </div>
      </div>
    </div>}
  </main>;
}

