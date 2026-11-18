"use client";

import * as React from "react";

import { useWorkspaceConfig } from "@/components/workspace-config";
import { useSheetLeadsState } from "@/lib/sheet-leads";
import { isBeforeSince } from "@/lib/workspace-config";

// 구글 시트 연동 상태를 앱 전체가 공유한다. 리드 인박스와 파이프라인이 같은 로그인·같은 데이터를 쓰고,
// 화면을 오가도 다시 불러오지 않는다. 이 데이터를 보는 화면이 있을 때만(useSheetLeads를 부르는 동안) 확인·갱신한다.

type State = ReturnType<typeof useSheetLeadsState>;
// 화면 설정의 기준일(leadsSince)보다 옛 고객은 customers에서 빠지고, 몇 명을 숨겼는지 알려 준다. 시트는 그대로다.
export type SheetLeads = State & { since: string | null; hiddenBySince: number };

const Ctx = React.createContext<{ state: State; subscribe: () => () => void } | null>(null);

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
  const { subscribe, state } = ctx;
  const { config } = useWorkspaceConfig();
  React.useEffect(() => subscribe(), [subscribe]);
  const since = config.leadsSince;
  return React.useMemo(() => {
    if (!since) return { ...state, since: null, hiddenBySince: 0 };
    const customers = state.customers.filter((c) => !isBeforeSince(c, since));
    return { ...state, customers, since, hiddenBySince: state.customers.length - customers.length };
  }, [state, since]);
}
