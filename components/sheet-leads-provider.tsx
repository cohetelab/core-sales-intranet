"use client";

import * as React from "react";

import { useSheetLeadsState } from "@/lib/sheet-leads";

// 구글 시트 연동 상태를 앱 전체가 공유한다. 리드 인박스와 파이프라인이 같은 로그인·같은 데이터를 쓰고,
// 화면을 오가도 다시 불러오지 않는다. 이 데이터를 보는 화면이 있을 때만(useSheetLeads를 부르는 동안) 확인·갱신한다.

export type SheetLeads = ReturnType<typeof useSheetLeadsState>;

const Ctx = React.createContext<{ state: SheetLeads; subscribe: () => () => void } | null>(null);

export function SheetLeadsProvider({ children }: { children: React.ReactNode }) {
  const [subscribers, setSubscribers] = React.useState(0);
  const state = useSheetLeadsState(subscribers > 0);
  const subscribe = React.useCallback(() => {
    setSubscribers((n) => n + 1);
    return () => setSubscribers((n) => n - 1);
  }, []);
  const value = React.useMemo(() => ({ state, subscribe }), [state, subscribe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSheetLeads(): SheetLeads {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("SheetLeadsProvider 안에서만 쓸 수 있습니다");
  const { subscribe } = ctx;
  React.useEffect(() => subscribe(), [subscribe]);
  return ctx.state;
}
