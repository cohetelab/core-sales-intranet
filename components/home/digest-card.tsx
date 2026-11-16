"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// 홈 맨 아래: 평일 아침 Slack으로 나가는 영업 알림의 연결 상태와 오늘 나갈 내용 미리보기. '지금 보내기'로 연결을 확인한다.
// 웹훅 주소는 서버에만 있고(Vercel 환경변수 SLACK_WEBHOOK_URL) 이 화면은 연결 여부만 안다.

type State = { configured: boolean; preview: string } | "loading" | "error";
const REASON: Record<string, string> = {
  not_configured: "Slack 연결이 설정되지 않았습니다",
  too_soon: "방금 보냈습니다. 잠시 뒤에 다시 눌러 주세요",
  slack_unreachable: "Slack에 연결하지 못했습니다",
  slack_404: "Slack이 웹훅 주소를 찾지 못했습니다(주소를 확인해 주세요)",
  slack_403: "Slack이 요청을 거절했습니다(웹훅이 비활성화됐을 수 있어요)",
  slack_400: "Slack이 글 형식을 받아들이지 못했습니다",
};

export function DigestCard() {
  const [state, setState] = React.useState<State>("loading");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/leads/digest", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { configured: boolean; preview: string }) => alive && setState(d))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/leads/digest", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string };
      setResult(d.sent ? { ok: true, text: "Slack으로 보냈습니다. 채널을 확인해 주세요." } : { ok: false, text: REASON[d.reason ?? ""] ?? "보내지 못했습니다" });
    } catch {
      setResult({ ok: false, text: "서버에 연결하지 못했습니다" });
    } finally {
      setSending(false);
    }
  }

  if (state === "loading" || state === "error") return null;
  return (
    <Card className="shadow-xs">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-primary" />
            Slack 알림 <span className="font-normal text-muted-foreground">· 평일 오전 9시대에 자동으로 나갑니다</span>
          </h2>
          <span className={cn("rounded-2xl px-2.5 py-1 text-xs", state.configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>
            {state.configured ? "연결됨" : "아직 연결 안 됨"}
          </span>
        </div>
        {!state.configured && (
          <p className="text-xs text-muted-foreground">
            Slack에서 수신 웹훅 주소를 만들고 Vercel 환경변수 <code className="rounded bg-muted px-1">SLACK_WEBHOOK_URL</code>에 넣으면 연결됩니다. 연결 전에도 아래 미리보기로 어떤 글이 나가는지 볼 수 있습니다.
          </p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">오늘 나갈 알림 미리보기</summary>
          <pre aria-label="알림 미리보기" className="mt-2 max-h-72 overflow-auto rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">{state.preview}</pre>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={!state.configured || sending} onClick={() => void send()}>
            {sending ? "보내는 중…" : "Slack으로 지금 보내기"}
          </Button>
          {result && (
            <span role={result.ok ? "status" : "alert"} className={cn("text-xs", result.ok ? "text-emerald-700" : "text-destructive")}>
              {result.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
