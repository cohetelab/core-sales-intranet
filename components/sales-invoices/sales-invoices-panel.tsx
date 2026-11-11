"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CopyIcon, FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerStore } from "@/lib/customer-store";
import {
  boltaIssuePayload,
  readSalesInvoiceDrafts,
  writeSalesInvoiceDrafts,
  type SalesInvoiceDraft,
} from "@/lib/sales-invoice-drafts";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function blankDraft(): SalesInvoiceDraft {
  return {
    id: crypto.randomUUID(), customerId: "", customerName: "", customerBusinessNumber: "",
    customerRepresentative: "", customerEmail: "", supplierName: "", supplierBusinessNumber: "",
    supplierRepresentative: "", supplierEmail: "", issueDate: today(), purpose: "CLAIM",
    itemName: "", supplyCost: 0, tax: 0, updatedAt: new Date().toISOString(),
  };
}

function Field({ label, value, onChange, type = "text", placeholder, required = true }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  const id = React.useId();
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>
    <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
  </div>;
}

export function SalesInvoicesPanel() {
  const { customers } = useCustomerStore();
  const params = useSearchParams();
  const customerId = params.get("customerId");
  const [drafts, setDrafts] = React.useState<SalesInvoiceDraft[]>([]);
  const [draft, setDraft] = React.useState<SalesInvoiceDraft | null>(null);
  const [ready, setReady] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(readSalesInvoiceDrafts());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready || !customerId) return;
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((current) => current?.customerId === customerId ? current : {
      ...blankDraft(), customerId: customer.id, customerName: customer.company, customerEmail: customer.email,
    });
  }, [ready, customerId, customers]);

  const change = (patch: Partial<SalesInvoiceDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setNotice("");
    setError("");
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const next = { ...draft, updatedAt: new Date().toISOString() };
    const records = [next, ...drafts.filter((entry) => entry.id !== draft.id)];
    try {
      writeSalesInvoiceDrafts(records);
      setDrafts(records);
      setDraft(next);
      setNotice("초안을 이 브라우저에 저장했습니다.");
    } catch {
      setError("브라우저 저장 공간에 초안을 저장하지 못했습니다.");
    }
  };

  const validateForCopy = (value: SalesInvoiceDraft) => {
    const required = [value.customerName, value.customerRepresentative, value.customerEmail,
      value.supplierName, value.supplierRepresentative, value.supplierEmail, value.itemName, value.issueDate];
    if (required.some((field) => !field.trim()) || !/^\d{10}$/.test(value.customerBusinessNumber.replace(/\D/g, "")) ||
      !/^\d{10}$/.test(value.supplierBusinessNumber.replace(/\D/g, ""))) {
      return "양쪽 사업자등록번호(10자리)와 필수 정보를 모두 입력해 주세요.";
    }
    if (!Number.isSafeInteger(value.supplyCost) || value.supplyCost <= 0 || !Number.isSafeInteger(value.tax) || value.tax < 0) {
      return "공급가액은 1원 이상, 세액은 0원 이상의 정수로 입력해 주세요.";
    }
    return "";
  };

  const copy = async () => {
    if (!draft) return;
    const problem = validateForCopy(draft);
    if (problem) { setError(problem); return; }
    try {
      await navigator.clipboard.writeText(JSON.stringify(boltaIssuePayload(draft), null, 2));
      setError("");
      setNotice("볼타 CLI 입력용 JSON을 복사했습니다. 실제 발행 전 사업자 정보와 금액을 다시 확인하세요.");
    } catch {
      setError("클립보드에 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  };

  const remove = (id: string) => {
    if (!window.confirm("이 초안을 삭제할까요?")) return;
    const records = drafts.filter((entry) => entry.id !== id);
    try {
      writeSalesInvoiceDrafts(records);
      setDrafts(records);
      if (draft?.id === id) setDraft(null);
    } catch { setError("초안을 삭제하지 못했습니다."); }
  };

  const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">매출 세금계산서</h1>
        <p className="mt-1 text-sm text-muted-foreground">고객사 발행 정보를 준비하고 볼타 CLI에 전달할 JSON을 만듭니다.</p>
      </div>
      <Button onClick={() => { setDraft(blankDraft()); setNotice(""); setError(""); }}><PlusIcon className="size-4" /> 새 초안</Button>
    </div>

    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed">
      이 화면은 발행 준비용입니다. 초안은 현재 브라우저에만 저장되며, 저장하거나 JSON을 복사해도 볼타에 발행 요청을 보내지 않습니다.
      실제 발행 여부와 국세청 승인 상태는 볼타에서 확인해야 합니다.
    </div>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}

    <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">저장한 초안 <span className="text-muted-foreground">{drafts.length}</span></h2>
        {!ready ? <p className="text-sm text-muted-foreground">초안을 불러오는 중입니다.</p> : drafts.length === 0 ?
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground"><FileTextIcon className="mx-auto mb-2 size-5" />저장한 초안이 없습니다.</div> :
          <div className="space-y-2">{drafts.map((entry) => <div key={entry.id} className={`flex items-start gap-2 rounded-xl border p-3 ${draft?.id === entry.id ? "border-primary bg-primary/5" : ""}`}>
            <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => { setDraft(entry); setError(""); setNotice(""); }}>
              <span className="block truncate text-sm font-medium">{entry.customerName || "고객사 미입력"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{entry.issueDate} · {money(entry.supplyCost + entry.tax)} · 초안</span>
            </button>
            <button type="button" aria-label={`${entry.customerName || "초안"} 삭제`} className="rounded-md p-1 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary" onClick={() => remove(entry.id)}><Trash2Icon className="size-4" /></button>
          </div>)}</div>}
      </section>

      <section className="min-w-0">
        {!draft ? <div className="flex min-h-72 items-center justify-center rounded-xl border p-6 text-center text-sm text-muted-foreground">초안을 선택하거나 새 초안을 만드세요.</div> :
          <form onSubmit={save} className="space-y-6 rounded-xl border p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">발행 정보 초안</h2>{draft.customerId && <Button asChild variant="outline" size="sm"><Link href={`/customers?id=${encodeURIComponent(draft.customerId)}`}>고객사 보기</Link></Button>}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="작성일" type="date" value={draft.issueDate} onChange={(issueDate) => change({ issueDate })} />
              <div className="space-y-1.5"><Label htmlFor="invoice-purpose">발행 목적</Label><select id="invoice-purpose" value={draft.purpose} onChange={(event) => change({ purpose: event.target.value as SalesInvoiceDraft["purpose"] })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="CLAIM">청구</option><option value="RECEIPT">영수</option></select></div>
            </div>
            <div className="space-y-3"><h3 className="border-b pb-2 text-sm font-semibold">공급자 · 우리 회사</h3><div className="grid gap-4 sm:grid-cols-2">
              <Field label="상호" value={draft.supplierName} onChange={(supplierName) => change({ supplierName })} />
              <Field label="사업자등록번호" value={draft.supplierBusinessNumber} onChange={(supplierBusinessNumber) => change({ supplierBusinessNumber })} placeholder="10자리" />
              <Field label="대표자" value={draft.supplierRepresentative} onChange={(supplierRepresentative) => change({ supplierRepresentative })} />
              <Field label="담당자 이메일" type="email" value={draft.supplierEmail} onChange={(supplierEmail) => change({ supplierEmail })} />
            </div></div>
            <div className="space-y-3"><h3 className="border-b pb-2 text-sm font-semibold">공급받는자 · 고객사</h3><div className="grid gap-4 sm:grid-cols-2">
              <Field label="상호" value={draft.customerName} onChange={(customerName) => change({ customerName })} />
              <Field label="사업자등록번호" value={draft.customerBusinessNumber} onChange={(customerBusinessNumber) => change({ customerBusinessNumber })} placeholder="10자리" />
              <Field label="대표자" value={draft.customerRepresentative} onChange={(customerRepresentative) => change({ customerRepresentative })} />
              <Field label="담당자 이메일" type="email" value={draft.customerEmail} onChange={(customerEmail) => change({ customerEmail })} />
            </div></div>
            <div className="space-y-3"><h3 className="border-b pb-2 text-sm font-semibold">품목 · 과세</h3><div className="grid gap-4 sm:grid-cols-3">
              <Field label="품목명" value={draft.itemName} onChange={(itemName) => change({ itemName })} />
              <Field label="공급가액" type="number" value={draft.supplyCost ? String(draft.supplyCost) : ""} onChange={(value) => change({ supplyCost: Number(value) })} placeholder="원" />
              <Field label="세액" type="number" value={draft.tax ? String(draft.tax) : "0"} onChange={(value) => change({ tax: Number(value) })} placeholder="원" />
            </div><p className="text-right text-sm font-semibold tabular-nums">합계 {money(draft.supplyCost + draft.tax)}</p></div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={copy}><CopyIcon className="size-4" /> 볼타 JSON 복사</Button><Button type="submit">초안 저장</Button></div>
            <p className="text-xs text-muted-foreground">JSON 복사는 입력 형식만 확인합니다. 볼타 CLI의 --dry-run과 실제 사업자·금액 확인을 거친 뒤 발행하세요.</p>
          </form>}
      </section>
    </div>
  </div>;
}
