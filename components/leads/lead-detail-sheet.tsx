"use client";

import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/format";
import type { Customer } from "@/lib/types";

// 시트 연동 모드에서 리드를 눌렀을 때 오른쪽에 열리는 상세. (고객 상세 화면은 브라우저 저장 고객만 다룬다)
export function LeadDetailSheet({
  customer,
  row,
  sheetUrl,
  gid,
  onClose,
}: {
  customer: Customer | null;
  row?: number;
  sheetUrl: string;
  gid: number;
  onClose: () => void;
}) {
  // 서버가 준 주소라도 구글 시트 주소일 때만 링크로 보여준다.
  const sheetLink =
    customer && row && sheetUrl.startsWith("https://docs.google.com/") ? `${sheetUrl.split("#")[0]}#gid=${gid}&range=A${row}` : null;

  return (
    <Sheet open={customer !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {customer && (
          <>
            <SheetHeader>
              <SheetTitle>{customer.company}</SheetTitle>
              <SheetDescription>
                {customer.category} · 담당 {customer.owner}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6 text-sm">
              <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">연락처</dt>
                <dd>{customer.phone ? <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a> : "-"}</dd>
                <dt className="text-muted-foreground">이메일</dt>
                <dd className="break-all">{customer.email ? <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a> : "-"}</dd>
                <dt className="text-muted-foreground">다음 액션</dt>
                <dd>{customer.nextStep ?? "-"}</dd>
                <dt className="text-muted-foreground">문의 접수</dt>
                <dd className="tabular-nums">{formatDateTime(customer.createdAt)}</dd>
              </dl>
              {customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customer.tags.map((t) => (
                    <Badge key={t} variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {sheetLink && (
                <a href={sheetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  시트에서 이 행 보기 <ExternalLinkIcon className="size-3" />
                </a>
              )}
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">문의·활동 이력</h3>
                <ol className="space-y-2">
                  {customer.activities.map((a) => (
                    <li key={a.id} className="rounded-2xl bg-muted/50 px-3 py-2">
                      <p className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium">{a.summary}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">{formatDateTime(a.at)}</span>
                      </p>
                      {a.detail && <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{a.detail}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
