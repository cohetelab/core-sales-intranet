"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Account = { id: string; label: string; handle: string | null; daily_cap: number; min_interval_sec: number; active: boolean };
type Target = {
  id: string;
  handle: string;
  display_name: string | null;
  followers: number | null;
  category: string | null;
  status: string;
  notes: string | null;
};
type Message = {
  id: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
  target: { handle: string; display_name: string | null } | null;
  account: { label: string } | null;
};
type Reply = {
  id: string;
  body: string;
  handled: boolean;
  received_at: string;
  target: { handle: string; display_name: string | null } | null;
  account: { label: string } | null;
};

type Tab = "targets" | "messages" | "replies" | "accounts";
const TABS: { id: Tab; label: string }[] = [
  { id: "targets", label: "후보" },
  { id: "messages", label: "대기열" },
  { id: "replies", label: "답장함" },
  { id: "accounts", label: "발송 계정" },
];

const STATUS_LABEL: Record<string, string> = {
  candidate: "후보",
  approved: "승인",
  excluded: "제외",
  contacted: "연락함",
  replied: "답장 옴",
  closed: "종료",
  draft: "초안",
  sending: "발송 중",
  sent: "발송됨",
  failed: "실패",
  cancelled: "취소",
};

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const res = await fetch(`/api/outreach/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: body.data as T, error: body.error };
}

export default function OutreachPage() {
  const [auth, setAuth] = React.useState<"checking" | "in" | "out" | "unconfigured">("checking");
  const [tab, setTab] = React.useState<Tab>("targets");
  const [notice, setNotice] = React.useState<string | null>(null);

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [replies, setReplies] = React.useState<Reply[]>([]);

  const refresh = React.useCallback(async () => {
    const [a, t, m, r] = await Promise.all([
      api<Account[]>("admin/accounts"),
      api<Target[]>("admin/targets"),
      api<Message[]>("admin/messages"),
      api<Reply[]>("admin/replies"),
    ]);
    if (a.status === 401) return setAuth("out");
    if (a.status === 503) return setAuth("unconfigured");
    setAuth("in");
    setAccounts(a.data ?? []);
    setTargets(t.data ?? []);
    setMessages(m.data ?? []);
    setReplies(r.data ?? []);
  }, []);

  React.useEffect(() => {
    // 처음 한 번 로그인 상태를 확인하고 데이터를 불러온다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await fn();
    setNotice(r.ok ? null : (r.error ?? "실패했습니다."));
    if (r.ok) await refresh();
  };

  if (auth === "checking") return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (auth === "unconfigured") {
    return (
      <p className="max-w-xl text-sm text-muted-foreground">
        서버 환경변수가 설정되지 않았습니다. <code>supabase/outreach.env.example</code> 파일을 보고 4개 값을 넣어 주세요.
      </p>
    );
  }
  if (auth === "out") return <Login onDone={refresh} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "replies" && replies.some((r) => !r.handled) ? ` (${replies.filter((r) => !r.handled).length})` : ""}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={async () => {
            await api("login", { method: "DELETE" });
            setAuth("out");
          }}
        >
          로그아웃
        </Button>
      </div>
      {notice && <p className="text-sm text-destructive">{notice}</p>}

      {tab === "targets" && <Targets targets={targets} accounts={accounts} run={run} />}
      {tab === "messages" && <Messages messages={messages} run={run} />}
      {tab === "replies" && <Replies replies={replies} run={run} />}
      {tab === "accounts" && <Accounts accounts={accounts} run={run} />}
    </div>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <form
      className="max-w-xs space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await api("login", { method: "POST", body: JSON.stringify({ password: pw }) });
        if (r.ok) onDone();
        else setErr(r.error ?? "로그인 실패");
      }}
    >
      <p className="text-sm text-muted-foreground">DM 아웃리치는 비밀번호가 필요합니다.</p>
      <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" autoFocus />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={!pw}>
        로그인
      </Button>
    </form>
  );
}

function Targets({ targets, accounts, run }: { targets: Target[]; accounts: Account[]; run: Run }) {
  const [handle, setHandle] = React.useState("");
  const [name, setName] = React.useState("");
  const [drafting, setDrafting] = React.useState<string | null>(null);
  const [body, setBody] = React.useState("");
  const [accountId, setAccountId] = React.useState("");

  const activeAccounts = accounts.filter((a) => a.active);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            api("admin/targets", { method: "POST", body: JSON.stringify({ handle, display_name: name || undefined, source: "manual" }) })
          ).then(() => {
            setHandle("");
            setName("");
          });
        }}
      >
        <Input className="w-48" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@인스타 아이디" />
        <Input className="w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(선택)" />
        <Button type="submit" size="sm" disabled={!handle.trim()}>
          후보 추가
        </Button>
      </form>

      {targets.length === 0 && <p className="text-sm text-muted-foreground">아직 후보가 없습니다.</p>}
      {targets.map((t) => (
        <Card key={t.id} className="shadow-xs">
          <CardContent className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <a className="font-medium hover:underline" href={`https://www.instagram.com/${t.handle}/`} target="_blank" rel="noopener noreferrer">
                @{t.handle}
              </a>
              {t.display_name && <span className="text-sm text-muted-foreground">{t.display_name}</span>}
              {t.followers != null && <span className="text-xs text-muted-foreground">{t.followers.toLocaleString()}명</span>}
              {t.category && <Badge variant="outline">{t.category}</Badge>}
              <Badge>{STATUS_LABEL[t.status] ?? t.status}</Badge>
              <div className="ml-auto flex gap-1.5">
                {t.status === "candidate" && (
                  <Button size="sm" variant="outline" onClick={() => run(() => api(`admin/targets/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: "excluded" }) }))}>
                    제외
                  </Button>
                )}
                {(t.status === "candidate" || t.status === "approved") && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setDrafting(drafting === t.id ? null : t.id);
                      setBody("");
                      setAccountId(activeAccounts[0]?.id ?? "");
                    }}
                  >
                    DM 초안
                  </Button>
                )}
              </div>
            </div>
            {drafting === t.id && (
              <div className="space-y-2">
                <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {activeAccounts.length === 0 && <option value="">발송 계정을 먼저 등록하세요</option>}
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="보낼 DM 내용" rows={4} maxLength={2000} />
                <Button
                  size="sm"
                  disabled={!body.trim() || !accountId}
                  onClick={() =>
                    run(() => api("admin/messages", { method: "POST", body: JSON.stringify({ target_id: t.id, account_id: accountId, body }) })).then(() => setDrafting(null))
                  }
                >
                  초안 저장 (대기열로)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Messages({ messages, run }: { messages: Message[]; run: Run }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");

  if (messages.length === 0) return <p className="text-sm text-muted-foreground">대기열이 비어 있습니다.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">승인한 DM만 Aside가 가져갑니다. 계정별 하루 상한과 발송 간격은 서버가 지킵니다.</p>
      {messages.map((m) => (
        <Card key={m.id} className="shadow-xs">
          <CardContent className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">@{m.target?.handle}</span>
              <span className="text-muted-foreground">← {m.account?.label}</span>
              <Badge>{STATUS_LABEL[m.status] ?? m.status}</Badge>
              <div className="ml-auto flex gap-1.5">
                {m.status === "draft" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(m.id); setText(m.body); }}>
                      수정
                    </Button>
                    <Button size="sm" onClick={() => run(() => api(`admin/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }))}>
                      승인
                    </Button>
                  </>
                )}
                {(m.status === "draft" || m.status === "approved") && (
                  <Button size="sm" variant="outline" onClick={() => run(() => api(`admin/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }))}>
                    취소
                  </Button>
                )}
              </div>
            </div>
            {editing === m.id ? (
              <div className="space-y-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} />
                <Button
                  size="sm"
                  disabled={!text.trim()}
                  onClick={() => run(() => api(`admin/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ action: "edit", body: text }) })).then(() => setEditing(null))}
                >
                  저장
                </Button>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            )}
            {m.error && <p className="text-xs text-destructive">{m.error}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Replies({ replies, run }: { replies: Reply[]; run: Run }) {
  if (replies.length === 0) return <p className="text-sm text-muted-foreground">받은 답장이 없습니다.</p>;
  return (
    <div className="space-y-3">
      {replies.map((r) => (
        <Card key={r.id} className="shadow-xs">
          <CardContent className="space-y-1.5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">@{r.target?.handle}</span>
              <span className="text-muted-foreground">→ {r.account?.label}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.received_at).toLocaleString("ko-KR")}</span>
              <Button
                size="sm"
                variant={r.handled ? "outline" : "default"}
                className="ml-auto"
                onClick={() => run(() => api(`admin/replies/${r.id}`, { method: "PATCH", body: JSON.stringify({ handled: !r.handled }) }))}
              >
                {r.handled ? "처리 취소" : "처리 완료"}
              </Button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{r.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Accounts({ accounts, run }: { accounts: Account[]; run: Run }) {
  const [label, setLabel] = React.useState("");
  const [handle, setHandle] = React.useState("");

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api("admin/accounts", { method: "POST", body: JSON.stringify({ label, handle: handle.replace(/^@/, "") || undefined }) })).then(() => {
            setLabel("");
            setHandle("");
          });
        }}
      >
        <Input className="w-48" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="계정 이름(예: 인스타 1)" />
        <Input className="w-48" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@아이디(선택)" />
        <Button type="submit" size="sm" disabled={!label.trim()}>
          계정 추가
        </Button>
      </form>
      {accounts.map((a) => (
        <Card key={a.id} className="shadow-xs">
          <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <span className="font-medium">{a.label}</span>
            {a.handle && <span className="text-muted-foreground">@{a.handle}</span>}
            <label className="flex items-center gap-1.5">
              하루 상한
              <Input
                className="h-8 w-16"
                type="number"
                min={0}
                defaultValue={a.daily_cap}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 0 && v !== a.daily_cap) void run(() => api(`admin/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ daily_cap: v }) }));
                }}
              />
            </label>
            <label className="flex items-center gap-1.5">
              간격(초)
              <Input
                className="h-8 w-20"
                type="number"
                min={0}
                defaultValue={a.min_interval_sec}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 0 && v !== a.min_interval_sec) void run(() => api(`admin/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ min_interval_sec: v }) }));
                }}
              />
            </label>
            <Button
              size="sm"
              variant={a.active ? "default" : "outline"}
              className="ml-auto"
              onClick={() => run(() => api(`admin/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) }))}
            >
              {a.active ? "사용 중" : "중지됨"}
            </Button>
          </CardContent>
        </Card>
      ))}
      {accounts.length === 0 && <p className="text-sm text-muted-foreground">발송 계정을 먼저 등록하세요.</p>}
    </div>
  );
}
