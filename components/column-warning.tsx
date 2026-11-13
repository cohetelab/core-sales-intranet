import { TriangleAlertIcon } from "lucide-react";

import type { MissingColumn } from "@/lib/lead-sheet";

// 시트의 열 이름이 바뀌거나 열이 지워지면 인트라넷이 그 칸을 못 찾아 값이 조용히 비어 보인다.
// 그럴 때 어떤 칸을 못 찾았고 무엇이 영향을 받는지 화면 위에 알려 준다.
export function ColumnWarning({ missing }: { missing: MissingColumn[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" aria-label="시트 열 확인" className="space-y-1.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs text-amber-950 ring-1 ring-amber-300/60">
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        시트에서 {missing.length}개 칸을 찾지 못했습니다. 열 이름이 바뀌었거나 지워졌는지 확인해 주세요.
      </p>
      <ul className="space-y-0.5 pl-5">
        {missing.map((m) => (
          <li key={m.key} className="list-disc">
            <strong className="font-medium">{m.label}</strong> — {m.impact}
            <span className="text-amber-900/70"> (알아보는 이름: {m.accepts.join(", ")})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
