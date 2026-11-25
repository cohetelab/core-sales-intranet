// 정산 시트 파서: 시트의 한 탭(맨 윗줄이 열 제목)을 정산 행으로 바꾼다. 읽기만 하고 아무것도 쓰지 않는다. React·서버와 무관한 순수 규칙만 담는다.
//
// 시트는 사람이 손으로 관리해서 표기가 섞여 있다(금액이 "₩145,050"과 "145050"이 함께 있고, 숫자가 아닌 값·빈 행·합계 행이 끼어 있다).
// 그래서 값을 억지로 맞추지 않고, 읽을 수 없는 칸은 비워 두고(null) 무엇이 이상한지 warnings 로 알려 준다.

export type PayStatus = "paid" | "waiting" | "refund" | "unset" | "other";

export type SettlementRow = {
  row: number; // 시트의 행 번호(1부터, 맨 윗줄이 1)
  source: string; // 구분(법인·사업부)
  advertiser: string;
  project: string;
  creator: string; // 인플루언서명
  cost: number | null; // 인플루언서 비용
  after: number | null; // 공제 후 금액
  revenue: number | null; // 광고주 계약 매출
  uploaded: boolean; // 업로드 여부가 O
  uploadNote: string; // 업로드 여부 칸에 O 가 아닌 값이 적혀 있으면 그 값(파일명 등)
  uploadUrl: string;
  status: PayStatus;
  statusText: string; // 결제 여부 칸의 원문
  paidAt: string; // YYYY-MM-DD (읽을 수 없으면 빈 값)
  paidAtText: string; // 결제일 칸의 원문
};

export type Warning = { id: string; text: string; count: number; rows: number[] }; // count: 해당 행 수 · rows: 그중 시트 행 번호(앞쪽 8개만)

export type ParsedSettlement = {
  ok: true;
  rows: SettlementRow[];
  warnings: Warning[];
  skipped: { blank: number; summary: number };
  header: { row: number; missing: string[] };
};
export type ParseFailure = { ok: false; error: "no_header" | "empty" };

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

// 열 제목 별칭(공백·대소문자 무시)
const ALIASES: Record<string, string[]> = {
  source: ["구분"],
  advertiser: ["광고주"],
  project: ["프로젝트명", "프로젝트", "캠페인", "캠페인명"],
  creator: ["인플루언서명", "인플루언서", "크리에이터", "크리에이터명"],
  cost: ["인플루언서비용", "지급비용", "비용"],
  after: ["공제후금액", "공제후"],
  revenue: ["광고주계약매출", "계약매출", "매출"],
  uploaded: ["업로드여부", "업로드"],
  uploadUrl: ["업로드url", "업로드링크", "결과url"],
  status: ["결제여부", "정산여부", "지급여부"],
  paidAt: ["결제일", "지급일"],
};
const LABEL: Record<string, string> = {
  source: "구분", advertiser: "광고주", project: "프로젝트명", creator: "인플루언서명", cost: "인플루언서 비용", after: "공제 후 금액",
  revenue: "광고주 계약 매출", uploaded: "업로드 여부", uploadUrl: "업로드 URL", status: "결제 여부", paidAt: "결제일",
};
const REQUIRED = ["creator", "status"] as const;

// 금액: "₩145,050" · "145050" · "145,050원" · "-1,000" · "(1,000)". 비어 있으면 null, 숫자가 아니면 NaN(이상한 값).
export function parseMoney(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/^[₩\s]+/, ""));
  const digits = t.replace(/[₩원,\s()-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return Number.NaN;
  const v = Math.round(Number(digits));
  return neg ? -v : v;
}

// 날짜: "2026-04-27" · "2026.04.27" · "2026.07.06 12:42" · "2026. 4. 27." → YYYY-MM-DD, 읽을 수 없으면 ""
export function parseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function payStatusOf(text: string): PayStatus {
  const t = norm(text);
  if (!t) return "unset";
  if (/환불|취소/.test(t)) return "refund";
  if (/완료|지급됨|입금/.test(t)) return "paid";
  if (/대기|예정|보류/.test(t)) return "waiting";
  return "other";
}

const FILEISH = /\.(mp4|mov|avi|jpg|jpeg|png|pdf|zip)$/i;

export function parseSettlementSheet(values: string[][]): ParsedSettlement | ParseFailure {
  if (!Array.isArray(values) || values.length === 0) return { ok: false, error: "empty" };
  // 헤더 행: 인플루언서명과 결제 여부 열 제목이 모두 있는 첫 행(맨 위 메모·제목 행은 건너뛴다)
  let headerRow = -1;
  let cols: Record<string, number> = {};
  for (let r = 0; r < values.length; r++) {
    const cells = values[r].map(norm);
    const found: Record<string, number> = {};
    for (const [key, names] of Object.entries(ALIASES)) {
      const i = cells.findIndex((c) => c && names.includes(c));
      if (i >= 0) found[key] = i;
    }
    if (REQUIRED.every((k) => k in found)) {
      headerRow = r;
      cols = found;
      break;
    }
  }
  if (headerRow < 0) return { ok: false, error: "no_header" };

  const get = (row: string[], key: string) => (key in cols ? String(row[cols[key]] ?? "").trim() : "");
  const rows: SettlementRow[] = [];
  const skipped = { blank: 0, summary: 0 };
  const bag: Record<string, number[]> = {};
  const flag = (id: string, row: number) => (bag[id] ??= []).push(row);

  for (let r = headerRow + 1; r < values.length; r++) {
    const raw = values[r];
    const sheetRow = r + 1;
    if (!raw.some((c) => String(c ?? "").trim())) {
      skipped.blank++;
      continue;
    }
    const creator = get(raw, "creator");
    const money = (key: string) => {
      const text = get(raw, key);
      const v = parseMoney(text);
      if (v !== null && Number.isNaN(v)) {
        flag(`bad_${key}`, sheetRow);
        return null;
      }
      return v;
    };
    const cost = money("cost");
    const after = money("after");
    const revenue = money("revenue");
    if (!creator) {
      // 인플루언서명이 없는데 금액만 있는 행은 합계·소계로 보고 제외한다(합계에 이중으로 더해지지 않게)
      if (cost || after || revenue) {
        skipped.summary++;
        flag("summary", sheetRow);
      } else skipped.blank++;
      continue;
    }

    const uploadRaw = get(raw, "uploaded");
    const uploaded = uploadRaw.toUpperCase() === "O";
    const statusText = get(raw, "status");
    const status = payStatusOf(statusText);
    const paidAtText = get(raw, "paidAt");
    const paidAt = parseDate(paidAtText);

    if (cost === null && after === null) flag("no_payout", sheetRow);
    if (uploadRaw && !uploaded) flag(FILEISH.test(uploadRaw) ? "upload_filename" : "upload_other", sheetRow);
    if (status === "unset") flag("status_unset", sheetRow);
    if (status === "other") flag("status_other", sheetRow);
    if (status === "paid" && !paidAt) flag("paid_no_date", sheetRow);
    if (status !== "paid" && status !== "refund" && paidAtText) flag("date_not_paid", sheetRow);
    if (paidAtText && !paidAt) flag("bad_date", sheetRow);

    rows.push({
      row: sheetRow,
      source: get(raw, "source"),
      advertiser: get(raw, "advertiser"),
      project: get(raw, "project"),
      creator,
      cost,
      after,
      revenue,
      uploaded,
      uploadNote: uploadRaw && !uploaded ? uploadRaw : "",
      uploadUrl: get(raw, "uploadUrl"),
      status,
      statusText,
      paidAt,
      paidAtText,
    });
  }

  const TEXT: Record<string, string> = {
    no_payout: "인플루언서 비용과 공제 후 금액이 모두 비어 있는 행(지급액을 알 수 없어 합계에서 0원으로 셉니다)",
    bad_cost: "인플루언서 비용이 숫자가 아닌 칸(0원이 아니라 '알 수 없음'으로 둡니다)",
    bad_after: "공제 후 금액이 숫자가 아닌 칸",
    bad_revenue: "광고주 계약 매출이 숫자가 아닌 칸(수식 오류나 글자로 보입니다)",
    summary: "인플루언서명이 없는데 금액만 있는 행(합계·소계로 보고 목록과 합계에서 제외했습니다)",
    upload_filename: "업로드 여부 칸에 파일명이 들어 있는 행(업로드 URL 칸에 넣을 값으로 보입니다)",
    upload_other: "업로드 여부 칸에 O 가 아닌 값이 들어 있는 행",
    status_unset: "결제 여부가 비어 있는 행(미결제로 셉니다)",
    status_other: "결제 여부가 '결제 완료/결제 대기/환불'이 아닌 값인 행",
    paid_no_date: "결제 완료인데 결제일이 없거나 읽을 수 없는 행",
    date_not_paid: "결제일은 있는데 결제 여부가 결제 완료가 아닌 행",
    bad_date: "결제일 형식을 읽을 수 없는 행",
  };
  const ORDER = ["bad_cost", "bad_after", "bad_revenue", "no_payout", "summary", "paid_no_date", "date_not_paid", "bad_date", "status_other", "upload_filename", "upload_other", "status_unset"];
  const warnings: Warning[] = ORDER.filter((id) => bag[id]?.length).map((id) => ({ id, text: TEXT[id], count: bag[id].length, rows: bag[id].slice(0, 8) }));

  const missing = Object.keys(ALIASES).filter((k) => !(k in cols)).map((k) => LABEL[k]);
  return { ok: true, rows, warnings, skipped, header: { row: headerRow + 1, missing } };
}

// ── 집계 ──
// 지급액: 공제 후 금액이 있으면 그것, 없으면 인플루언서 비용. 둘 다 없으면 0.
export const payoutOf = (r: SettlementRow) => r.after ?? r.cost ?? 0;
export const isPaidRow = (r: SettlementRow) => r.status === "paid";

export type Totals = { rows: number; payout: number; paid: number; paidRows: number; unpaid: number; unpaidRows: number; refund: number; refundRows: number; revenue: number; revenueRows: number };
export function totalsOf(rows: SettlementRow[]): Totals {
  const t: Totals = { rows: rows.length, payout: 0, paid: 0, paidRows: 0, unpaid: 0, unpaidRows: 0, refund: 0, refundRows: 0, revenue: 0, revenueRows: 0 };
  for (const r of rows) {
    const p = payoutOf(r);
    if (r.status === "refund") {
      t.refund += p;
      t.refundRows++;
      continue; // 환불은 지급액·미결제 어디에도 넣지 않는다
    }
    t.payout += p;
    if (r.status === "paid") {
      t.paid += p;
      t.paidRows++;
    } else {
      t.unpaid += p;
      t.unpaidRows++;
    }
    if (r.revenue !== null) {
      t.revenue += r.revenue;
      t.revenueRows++;
    }
  }
  return t;
}
