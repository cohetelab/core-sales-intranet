"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasStampedNote } from "@/lib/lead-response";
import { FIELD_KEYS, cleanCell, formatContract, fromSheetDate, noteLine, sameCell, toSheetDate, todayKst, type FieldKey } from "@/lib/lead-fields";

type Raw = Partial<Record<FieldKey, string>>;
export type RecordResult = { ok: boolean; message?: string; raw?: Raw };

const initialFrom = (raw: Raw) => ({
  nextAction: cleanCell(raw.nextAction),
  probability: cleanCell(raw.probability).replace(/%+$/, ""),
  lastContact: fromSheetDate(raw.lastContact),
  retouch: fromSheetDate(raw.retouch),
  memo: cleanCell(raw.memo),
  contract: cleanCell(raw.contract).replace(/\D/g, ""),
});

// 상담 기록 폼. 열었을 때의 시트 원문(base)을 기억해 두었다가 저장할 때 같이 보낸다.
// 그 사이 시트에서 같은 칸이 바뀌었으면 서버가 덮어쓰지 않고 알려 준다.
export function LeadRecordForm({
  raw,
  user,
  showContract = false,
  onSave,
}: {
  raw: Raw;
  user: string;
  showContract?: boolean;
  onSave: (changes: Raw, base: Raw) => Promise<RecordResult>;
}) {
  const [base, setBase] = React.useState<Raw>(raw);
  const init = React.useMemo(() => initialFrom(base), [base]);
  const [note, setNote] = React.useState("");
  const [f, setF] = React.useState(init);
  const [contactTouched, setContactTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  // 폼을 연 뒤 시트에서 이 고객의 칸이 바뀌었는지(다른 사람이 고쳤는지)
  const stale = FIELD_KEYS.some((k) => !sameCell(k, raw[k], base[k]));

  function reload() {
    setBase(raw);
    setF(initialFrom(raw));
    setNote("");
    setContactTouched(false);
    setMessage(null);
  }

  const noteText = note.trim();
  const contact = noteText && !contactTouched ? todayKst() : f.lastContact;
  const probability = f.probability.trim();
  const probabilityBad = probability !== "" && !(/^\d{1,3}$/.test(probability) && Number(probability) <= 100);
  const contractBad = showContract && f.contract !== "" && !(/^\d{1,13}$/.test(f.contract) && Number(f.contract) > 0 && Number(f.contract) <= 1_000_000_000_000);

  const changes: Raw = {};
  if (noteText) {
    const existing = cleanCell(base.consult);
    changes.consult = `${existing ? `${existing}\n` : ""}${noteLine(user, noteText)}`;
  }
  if (contact !== init.lastContact) changes.lastContact = contact ? toSheetDate(contact) : "";
  if (f.retouch !== init.retouch) changes.retouch = f.retouch ? toSheetDate(f.retouch) : "";
  if (f.nextAction.trim() !== init.nextAction) changes.nextAction = f.nextAction.trim();
  if (probability !== init.probability && !probabilityBad) changes.probability = probability ? `${probability}%` : "";
  if (f.memo.trim() !== init.memo) changes.memo = f.memo.trim();
  if (showContract && !contractBad && f.contract !== init.contract) changes.contract = f.contract ? formatContract(Number(f.contract)) : "";
  const hasChanges = Object.keys(changes).length > 0;

  async function save() {
    if (!hasChanges || probabilityBad || contractBad) return;
    await submit(changes);
  }

  // 시각이 남은 기록이 아직 없는 고객에게 한 번 눌러 "첫 컨택 완료"를 남긴다(응답 속도 측정의 기준이 된다).
  async function markFirstContact() {
    const existing = cleanCell(base.consult);
    await submit({ consult: `${existing ? `${existing}\n` : ""}${noteLine(user, "첫 컨택 완료")}`, lastContact: toSheetDate(todayKst()) });
  }

  async function submit(toSave: Raw) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const res = await onSave(toSave, base);
    setSaving(false);
    if (res.ok) {
      const next = res.raw ?? {};
      setBase(next); // 저장 직후 시트에서 새로 읽은 원문이 새 기준값
      setF(initialFrom(next));
      setNote("");
      setContactTouched(false);
      setMessage({ ok: true, text: "시트에 저장했습니다" });
    } else {
      setMessage({ ok: false, text: res.message ?? "저장하지 못했습니다" });
    }
  }

  const existingNote = cleanCell(base.consult);
  const needsFirstContact = !hasStampedNote(base.consult);

  return (
    <section className="space-y-3 rounded-2xl border p-3" aria-label="상담 기록">
      <h3 className="text-xs font-medium">상담 기록 <span className="font-normal text-muted-foreground">· 구글 시트에 저장됩니다</span></h3>

      {stale && (
        <p role="alert" className="flex items-start justify-between gap-2 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          <span>시트에서 이 고객의 내용이 바뀌었습니다. 저장하면 충돌할 수 있어요.</span>
          <button type="button" onClick={reload} className="shrink-0 underline">최신으로 불러오기</button>
        </p>
      )}

      {needsFirstContact && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-2">
          <Button size="sm" variant="outline" className="h-8" disabled={saving || hasChanges} onClick={() => void markFirstContact()}>
            첫 컨택 완료
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {hasChanges ? "저장하지 않은 내용이 있어요. 먼저 저장해 주세요." : "아직 시각이 남은 상담 기록이 없습니다. 연락했다면 눌러서 기록하세요."}
          </span>
        </div>
      )}

      {existingNote && (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">지금까지의 상담 내용</p>
          <p className="max-h-32 overflow-y-auto rounded-xl bg-muted/50 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">{existingNote}</p>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="lead-note" className="text-xs">상담 내용 추가</Label>
        <Textarea
          id="lead-note"
          rows={3}
          maxLength={1500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="통화·미팅 내용을 적으면 [날짜 시간 이름]과 함께 이어서 기록됩니다"
          className="text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="lead-contact" className="text-xs">최근 연락일</Label>
          <Input id="lead-contact" type="date" className="h-8 text-xs" value={contact} onChange={(e) => { setContactTouched(true); setF((p) => ({ ...p, lastContact: e.target.value })); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lead-retouch" className="text-xs">리터치 일정</Label>
          <Input id="lead-retouch" type="date" className="h-8 text-xs" value={f.retouch} onChange={(e) => setF((p) => ({ ...p, retouch: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div className="space-y-1">
          <Label htmlFor="lead-next" className="text-xs">다음 액션</Label>
          <Input id="lead-next" className="h-8 text-xs" maxLength={200} value={f.nextAction} onChange={(e) => setF((p) => ({ ...p, nextAction: e.target.value }))} placeholder="예: 견적 발송" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lead-prob" className="text-xs">가능성(%)</Label>
          <Input id="lead-prob" inputMode="numeric" className="h-8 text-xs" aria-invalid={probabilityBad} value={f.probability} onChange={(e) => setF((p) => ({ ...p, probability: e.target.value }))} placeholder="0~100" />
        </div>
      </div>
      {probabilityBad && <p role="alert" className="text-[11px] text-destructive">가능성은 0~100 사이 숫자로 적어 주세요.</p>}

      {showContract && (
        <div className="space-y-1">
          <Label htmlFor="lead-contract" className="text-xs">계약 금액(원)</Label>
          <Input
            id="lead-contract"
            inputMode="numeric"
            className="h-8 text-xs"
            aria-invalid={contractBad}
            value={f.contract}
            onChange={(e) => setF((p) => ({ ...p, contract: e.target.value.replace(/\D/g, "") }))}
            placeholder="예: 2090000"
          />
          {f.contract && !contractBad && <p className="text-[11px] text-muted-foreground tabular-nums">시트에는 {formatContract(Number(f.contract))} 로 기록됩니다</p>}
          {contractBad && <p role="alert" className="text-[11px] text-destructive">금액은 숫자만 적어 주세요.</p>}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="lead-memo" className="text-xs">메모</Label>
        <Textarea id="lead-memo" rows={2} maxLength={1000} value={f.memo} onChange={(e) => setF((p) => ({ ...p, memo: e.target.value }))} className="text-xs" />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!hasChanges || saving || probabilityBad || contractBad}>
          {saving ? "시트에 저장하는 중…" : "시트에 저장"}
        </Button>
        {!hasChanges && !message && <span className="text-[11px] text-muted-foreground">바뀐 내용이 없습니다</span>}
        {message && (
          <span role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}
