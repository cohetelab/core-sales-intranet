"use client";

import * as React from "react";
import { FileUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCustomerStore } from "@/lib/customer-store";
import {
  parseInquirySheet,
  recordToCustomer,
  SERVICE_LABELS,
  type LeadParseResult,
} from "@/lib/lead-sheet";
import { customers as sampleCustomers } from "@/lib/mock-data";
import { SALES_REPS } from "@/lib/sales-reps";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SAMPLE_IDS = new Set(sampleCustomers.map((c) => c.id));

type Parsed = Extract<LeadParseResult, { ok: true }>;

export function LeadImportDialog() {
  const { customers, importCustomers } = useCustomerStore();
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [error, setError] = React.useState("");
  const [removeSamples, setRemoveSamples] = React.useState(true);
  const [done, setDone] = React.useState("");

  function reset() {
    setFileName("");
    setParsed(null);
    setError("");
    setDone("");
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    reset();
    if (file.size > MAX_FILE_BYTES) {
      setError("8MB 이하 CSV 파일만 가져올 수 있습니다.");
      return;
    }
    setFileName(file.name);
    const result = parseInquirySheet(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setParsed(result);
  }

  const preview = React.useMemo(() => {
    if (!parsed) return null;
    const existing = new Set(customers.map((c) => c.id));
    const fresh = parsed.records.filter((r) => !existing.has(r.id)).length;
    const byService = SERVICE_LABELS.map((l) => ({ label: l as string, n: parsed.records.filter((r) => r.services.includes(l)).length }));
    byService.push({ label: "미분류", n: parsed.records.filter((r) => r.services.length === 0).length });
    const byOwner = [
      ...SALES_REPS.map((r) => ({ label: r as string, n: parsed.records.filter((x) => x.owner === r).length })),
      { label: "이전 담당자(앱 영업 아님)", n: parsed.records.filter((x) => !x.owner && x.originalOwner).length },
      { label: "담당자 없음", n: parsed.records.filter((x) => !x.owner && !x.originalOwner).length },
    ];
    return {
      total: parsed.records.length,
      fresh,
      merged: parsed.records.length - fresh,
      byService,
      byOwner,
      samples: customers.filter((c) => SAMPLE_IDS.has(c.id)).length,
    };
  }, [parsed, customers]);

  function handleImport() {
    if (!parsed || !preview) return;
    importCustomers(
      parsed.records.map((r) => recordToCustomer(r)),
      { removeIds: removeSamples ? Array.from(SAMPLE_IDS) : [] }
    );
    setDone(`가져왔습니다 — 새 고객 ${preview.fresh.toLocaleString("ko-KR")}명 추가, 기존 고객 ${preview.merged.toLocaleString("ko-KR")}명에 문의 이력 병합`);
    setParsed(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 py-2">
          <FileUpIcon className="size-3.5" /> CSV 가져오기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>문의 시트(CSV) 가져오기</DialogTitle>
          <DialogDescription>
            구글 시트에서 파일 → 다운로드 → 쉼표로 구분된 값(.csv)으로 받은 파일을 올려 주세요. 시트를 공개할 필요가 없고,
            파일은 이 브라우저 안에서만 처리됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
            <span className="truncate text-muted-foreground">{fileName || "CSV 파일을 선택하세요"}</span>
            <span className="shrink-0 rounded-xl bg-muted px-3 py-1 text-xs font-medium">파일 선택</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} aria-label="문의 시트 CSV 파일" />
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {done && <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{done}</p>}

          {parsed && preview && (
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-muted/50 p-3">
                <p className="font-medium">
                  문의 {parsed.stats.imported.toLocaleString("ko-KR")}건 → 고객 {preview.total.toLocaleString("ko-KR")}명
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  새 고객 {preview.fresh.toLocaleString("ko-KR")}명 · 이미 있는 고객 {preview.merged.toLocaleString("ko-KR")}명(새 문의만 이력에 추가, 담당·단계는 그대로)
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <dt className="mb-1 font-medium">서비스</dt>
                  {preview.byService.map((x) => (
                    <dd key={x.label} className="flex justify-between text-muted-foreground">
                      <span>{x.label}</span>
                      <span className="tabular-nums">{x.n.toLocaleString("ko-KR")}</span>
                    </dd>
                  ))}
                </div>
                <div>
                  <dt className="mb-1 font-medium">담당</dt>
                  {preview.byOwner.map((x) => (
                    <dd key={x.label} className="flex justify-between text-muted-foreground">
                      <span>{x.label}</span>
                      <span className="tabular-nums">{x.n.toLocaleString("ko-KR")}</span>
                    </dd>
                  ))}
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                정리된 것: 테스트 행 {parsed.stats.skippedTest}건 제외 · 형식이 잘못된 이메일 {parsed.stats.badEmail}건은 비움 · 수식 오류 셀(#N/A 등) {parsed.stats.errorCells.toLocaleString("ko-KR")}개는 빈 값 처리
              </p>
              {preview.samples > 0 && (
                <div className="flex items-start gap-2">
                  <Checkbox id="lead-remove-samples" checked={removeSamples} onCheckedChange={(v) => setRemoveSamples(v === true)} className="mt-0.5" />
                  <Label htmlFor="lead-remove-samples" className="text-xs leading-relaxed font-normal">
                    기존 샘플 고객 {preview.samples}명을 함께 지웁니다(직접 추가한 고객은 그대로 둡니다)
                  </Label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button disabled={!parsed} onClick={handleImport}>
            {parsed ? `${preview?.total.toLocaleString("ko-KR")}명 가져오기` : "가져오기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
