"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { InfoIcon } from "lucide-react";

// 구글 시트와 아직 연결되지 않은 화면에는 "샘플 데이터" 안내를 붙인다.
// 시트 연동이 설정돼 있을 때만 보인다(연동이 없으면 모든 화면이 샘플이라 안내가 필요 없다).
// 이 화면들을 시트로 연결하면 목록에서 빼면 된다.
const SAMPLE_PATHS = ["/team", "/weekly", "/campaigns", "/quotes", "/sales-invoices", "/agents", "/calendar"];

export function SampleDataNotice() {
  const pathname = usePathname();
  const [configured, setConfigured] = React.useState(false);
  const applies = SAMPLE_PATHS.includes(pathname);

  React.useEffect(() => {
    if (!applies) return;
    let alive = true;
    fetch("/api/leads/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean } | null) => {
        if (alive) setConfigured(Boolean(d?.configured));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [applies]);

  if (!applies || !configured) return null;
  return (
    <div role="note" className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong className="font-medium">샘플 데이터</strong> · 이 화면의 숫자와 고객은 아직 구글 시트와 연결되지 않은 예시입니다. 실제 현황은 홈, 리드 인박스, 딜 파이프라인, 고객사, 리포트에서 확인하세요.
      </span>
    </div>
  );
}
