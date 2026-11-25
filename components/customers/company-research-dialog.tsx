"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/lib/types";

const PASS_KEY = "company-research-passcode";

type Source = { title: string; url: string };
type Result = { text: string; sources: Source[]; searches: number; reads: number; truncated: boolean };

const ERRORS: Record<string, string> = {
  not_configured: "AI 조사가 아직 설정되지 않았습니다. 관리자에게 서버 환경변수(DEEPSEEK_API_KEY, ROOM_PASSCODE) 설정을 요청해 주세요.",
  unauthorized: "비밀번호가 맞지 않습니다.",
  too_many_attempts: "비밀번호를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.",
  rate_limited: "오늘 또는 최근 조사 횟수 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
  ai_auth: "AI 서비스 키가 올바르지 않거나 권한이 없습니다. 관리자에게 알려 주세요.",
  ai_quota: "AI 서비스 계정의 충전 잔액이 부족합니다. 관리자에게 알려 주세요.",
  ai_rate_limited: "AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.",
  ai_timeout: "조사가 시간 안에 끝나지 않았습니다. 회사 이름이나 사이트 주소를 더 정확히 적고 다시 시도해 주세요.",
  ai_empty: "AI가 빈 답을 보냈습니다. 다시 시도해 주세요.",
};

export function CompanyResearchDialog({ customer }: { customer: Customer }) {
  const [open, setOpen] = React.useState(false);
  const [passcode, setPasscode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [refused, setRefused] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    // 비밀번호는 이 탭이 열려 있는 동안만 기억한다(sessionStorage). 서버가 값을 검증한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasscode(window.sessionStorage.getItem(PASS_KEY) ?? "");
  }, []);

  // 다른 고객사를 열면 이전 조사 결과를 지운다(다른 회사 결과가 남아 보이지 않게).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
    setError("");
    setRefused(false);
  }, [customer.id]);

  async function run() {
    setLoading(true);
    setError("");
    setRefused(false);
    setResult(null);
    try {
      const response = await fetch("/api/company-research", {
        method: "POST",
        headers: { "content-type": "application/json", "x-room-passcode": passcode },
        body: JSON.stringify({ company: customer.company, website: customer.website, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.refused) setRefused(true);
      else if (response.ok && typeof data.text === "string") {
        window.sessionStorage.setItem(PASS_KEY, passcode);
        setResult(data as Result);
      } else {
        if (data.error === "unauthorized") window.sessionStorage.removeItem(PASS_KEY);
        setError(ERRORS[data.error as string] ?? "조사하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    const sources = result.sources.map((s) => `- ${s.title} ${s.url}`).join("\n");
    try {
      await navigator.clipboard.writeText(`${result.text}\n\n[출처]\n${sources || "- 없음"}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("복사하지 못했습니다. 글을 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <SearchIcon className="size-3.5" />
          AI 조사
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer.company} AI 조사</DialogTitle>
          <DialogDescription>
            웹 검색과 사이트 읽기로 만든 초안입니다. 고객사 기록은 바뀌지 않으며, 출처를 열어 확인한 뒤 사용하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="research-pass">조사 비밀번호</Label>
            <Input
              id="research-pass"
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="관리자에게 받은 비밀번호"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="research-note">참고 메모 (선택)</Label>
            <Textarea
              id="research-note"
              rows={2}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 뷰티 브랜드, 인플루언서 시딩 관심"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            회사 이름{customer.website && customer.website !== "-" ? "과 사이트 주소" : ""}가 외부 AI 서비스(DeepSeek)로 전송됩니다. 개인 연락처나 계약 금액은 보내지 않습니다.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {refused && <p className="text-sm text-destructive">AI가 이 요청에 답하지 않았습니다. 회사 이름이나 메모를 바꿔 다시 시도해 주세요.</p>}

          {result && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm">{result.text}</p>
              {result.truncated && <p className="text-xs text-amber-600">답변이 길어 중간에 잘렸을 수 있습니다.</p>}
              <div>
                <p className="text-xs font-medium text-muted-foreground">출처 {result.sources.length}건 (검색 {result.searches}회, 페이지 읽기 {result.reads}회)</p>
                {result.sources.length === 0 ? (
                  <p className="text-xs text-amber-600">출처가 붙지 않았습니다. 내용을 그대로 믿지 마세요.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {result.sources.map((s) => (
                      <li key={s.url} className="truncate">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {result && (
            <Button variant="outline" onClick={copy}>
              {copied ? "복사됨" : "복사"}
            </Button>
          )}
          <Button onClick={run} disabled={loading || !passcode.trim()}>
            {loading ? "조사 중… (최대 1분)" : result ? "다시 조사" : "조사 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
