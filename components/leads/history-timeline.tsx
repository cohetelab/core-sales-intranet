"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { parseHistory } from "@/lib/lead-history";

// 상담 히스토리 타임라인(오래된 기록이 위, 새 기록이 아래). 열면 가장 최근 기록이 보이게 아래로 스크롤한다.
export function HistoryTimeline({ consult }: { consult: string }) {
  const { legacy, entries } = React.useMemo(() => parseHistory(consult), [consult]);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (!legacy && entries.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">
        상담 히스토리 <span className="tabular-nums">· {entries.length}건</span>
      </p>
      <div ref={box} className="max-h-80 space-y-2 overflow-y-auto" role="list" aria-label="상담 히스토리">
        {legacy && (
          <div role="listitem" className="rounded-xl bg-muted/50 px-2.5 py-2">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">시트에 직접 적은 내용</p>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{legacy}</p>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.n} role="listitem" className="rounded-xl border bg-card px-2.5 py-2">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium" aria-hidden>
                {e.author.slice(0, 1).toUpperCase()}
              </span>
              <span className="font-medium">{e.author}</span>
              <span className="text-muted-foreground tabular-nums">
                {e.month}.{e.day} {e.time}
              </span>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                {e.n}차 컨택
              </Badge>
              {e.type && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                  {e.type}
                </Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{e.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
