"use client";

import * as React from "react";
import { ArrowRightLeftIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatContract } from "@/lib/lead-fields";

// 계약 전환 확인. 시트 연동 모드에서는 계약 금액(선택)을 같이 받아 시트의 '계약 금액' 칸에 기록한다.
export function ContractDialog({
  company,
  askAmount,
  onConfirm,
}: {
  company: string;
  askAmount: boolean;
  onConfirm: (amount?: number) => void;
}) {
  const [amount, setAmount] = React.useState("");
  const digits = amount.replace(/[^\d]/g, "");
  const value = digits ? Number(digits) : 0;
  const tooBig = value > 1_000_000_000_000;

  return (
    <AlertDialog onOpenChange={(open) => !open && setAmount("")}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs" aria-label={`${company} 계약으로 전환`}>
          <ArrowRightLeftIcon className="size-3.5" /> 계약 전환
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{company}을(를) 계약으로 전환할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            리드 목록에서 빠지고 &lsquo;계약&rsquo; 단계로 넘어갑니다. 활동 기록과 문의 이력은 그대로 따라갑니다.
            {askAmount && " 시트의 '단계' 칸에 '계약'이 기록됩니다."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {askAmount && (
          <div className="space-y-1">
            <label htmlFor="contract-amount" className="text-xs font-medium">계약 금액(원, 선택)</label>
            <Input
              id="contract-amount"
              inputMode="numeric"
              placeholder="예: 2090000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="계약 금액(원)"
              aria-invalid={tooBig}
            />
            {value > 0 && !tooBig && <p className="text-xs text-muted-foreground tabular-nums">시트에는 {formatContract(value)} 로 기록됩니다</p>}
            {tooBig && <p role="alert" className="text-xs text-destructive">금액이 너무 큽니다</p>}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction disabled={tooBig} onClick={() => onConfirm(askAmount && value > 0 ? value : undefined)}>
            계약으로 전환
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
