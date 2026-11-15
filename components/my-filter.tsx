"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// "내 리드만 보기": 로그인한 영업이 자기 담당만 한 번에 본다. 선택은 이 브라우저에 기억한다(홈·리드 인박스·파이프라인 공통).
const KEY = "core-sales-my-only";

export function useMyOnly(): [boolean, (v: boolean) => void] {
  const [mine, setMineState] = React.useState(false);
  React.useEffect(() => {
    try {
      // 저장된 선택은 마운트 이후 클라이언트에서만 읽을 수 있다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(KEY) === "1") setMineState(true);
    } catch {
      // 저장소를 못 쓰면 전체 보기
    }
  }, []);
  const setMine = React.useCallback((v: boolean) => {
    setMineState(v);
    try {
      if (v) window.localStorage.setItem(KEY, "1");
      else window.localStorage.removeItem(KEY);
    } catch {
      // 무시
    }
  }, []);
  return [mine, setMine];
}

export function MineChip({ active, onClick, count }: { active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="로그인한 내 담당 고객만 보기(미배정은 제외됩니다)"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-2xl px-3 text-xs font-medium ring-1 transition-colors",
        active ? "bg-primary text-primary-foreground ring-primary" : "ring-primary/40 text-primary hover:bg-primary/5"
      )}
    >
      내 리드만
      {count !== undefined && <span className="tabular-nums opacity-80">{count.toLocaleString("ko-KR")}</span>}
    </button>
  );
}
