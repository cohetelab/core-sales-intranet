"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PC / 모바일 화면 전환.
// 모바일 화면은 같은 페이지를 폭 390px짜리 프레임(iframe) 안에 띄워서 보여 준다.
// 화면 폭에 반응하는 스타일(md: 등)은 창 크기를 보기 때문에, 폭만 줄인 상자로는 진짜 모바일 모습이 나오지 않는다.
// 프레임 안은 진짜 폭 390px 창이라 휴대폰에서 열었을 때와 같게 보인다.

type Mode = "pc" | "mobile";
const KEY = "core-sales-view-mode";
const PHONE_W = 390;
const PHONE_H = 844;

type Ctx = { mode: Mode; setMode: (m: Mode) => void; embedded: boolean; ready: boolean };
const ViewModeContext = React.createContext<Ctx>({ mode: "pc", setMode: () => {}, embedded: false, ready: false });
export const useViewMode = () => React.useContext(ViewModeContext);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>("pc");
  const [embedded, setEmbedded] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    // 저장된 선택은 마운트 이후 클라이언트에서만 읽을 수 있다.
    // 미리보기 프레임 안에서는 저장된 값을 무시한다(프레임 안에 또 프레임이 생기면 안 된다).
    let inFrame = false;
    try {
      inFrame = window.self !== window.top;
    } catch {
      inFrame = true;
    }
    let saved: Mode = "pc";
    try {
      saved = window.localStorage.getItem(KEY) === "mobile" ? "mobile" : "pc";
    } catch {
      // 저장소를 못 쓰면 PC 화면
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setEmbedded(inFrame);
    setModeState(inFrame ? "pc" : saved);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setMode = React.useCallback((m: Mode) => {
    setModeState(m);
    try {
      if (m === "mobile") window.localStorage.setItem(KEY, "mobile");
      else window.localStorage.removeItem(KEY);
    } catch {
      // 무시
    }
  }, []);

  const value = React.useMemo(() => ({ mode, setMode, embedded, ready }), [mode, setMode, embedded, ready]);
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

// 헤더의 PC/모바일 버튼. 휴대폰이나 미리보기 프레임 안에서는 보이지 않는다.
export function ViewModeToggle() {
  const { mode, setMode, embedded, ready } = useViewMode();
  if (!ready || embedded) return null;
  return (
    <div className="hidden items-center rounded-2xl p-0.5 ring-1 ring-foreground/10 md:flex" role="group" aria-label="화면 전환">
      {(["pc", "mobile"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-xl px-2.5 text-xs transition-colors",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {m === "pc" ? <MonitorIcon className="size-3.5" /> : <SmartphoneIcon className="size-3.5" />}
          {m === "pc" ? "PC" : "모바일"}
        </button>
      ))}
    </div>
  );
}

// 모바일 모드일 때 앱 전체 대신 보여 주는 화면
function MobilePreview() {
  const { setMode } = useViewMode();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const frame = React.useRef<HTMLIFrameElement>(null);
  // 프레임을 처음 열 때의 주소만 쓴다(프레임 안에서 이동해도 프레임이 다시 로드되지 않게).
  const [src] = React.useState(() => `${pathname}${search ? `?${search}` : ""}`);

  function backToPc() {
    // 프레임 안에서 이동한 페이지로 PC 화면도 맞춰 준다.
    let next = src;
    try {
      const loc = frame.current?.contentWindow?.location;
      if (loc) next = `${loc.pathname}${loc.search}`;
    } catch {
      // 못 읽으면 처음 주소
    }
    setMode("pc");
    if (next !== `${pathname}${search ? `?${search}` : ""}`) router.push(next);
  }

  return (
    <div className="flex min-h-svh flex-col items-center gap-3 bg-muted/40 px-4 py-4">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <SmartphoneIcon className="size-4" /> 모바일 화면 미리보기 <span className="text-xs font-normal text-muted-foreground">({PHONE_W}px)</span>
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={backToPc}>
          <MonitorIcon className="size-3.5" /> PC 화면으로
        </Button>
      </div>
      <div
        className="overflow-hidden rounded-[2rem] border-[10px] border-foreground/80 bg-background shadow-xl"
        style={{ width: PHONE_W + 20, height: `min(${PHONE_H}px, calc(100svh - 6rem))` }}
      >
        <iframe ref={frame} src={src} title="모바일 화면 미리보기" className="size-full border-0" />
      </div>
    </div>
  );
}

export function ViewModeGate({ children }: { children: React.ReactNode }) {
  const { mode, embedded, ready } = useViewMode();
  if (ready && !embedded && mode === "mobile") return <MobilePreview />;
  return <>{children}</>;
}
