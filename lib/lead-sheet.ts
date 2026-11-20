import { parseCsv } from "./csv";
import { SALES_REPS, UNASSIGNED } from "./sales-reps";
import type { FieldKey } from "./lead-fields";
import type { Activity, Customer, DealStage } from "./types";

// 홈페이지·메타 문의가 쌓이는 구글 시트(CSV)를 리드로 바꾼다.
// 시트는 맨 위에 메모·연도 구분 행이 있고 헤더가 그 아래라서 헤더 행을 직접 찾는다.
// 같은 연락처로 여러 번 들어온 문의는 고객 1명에 문의 이력으로 합친다.

export const SERVICE_LABELS = ["숏폼", "인플루언서", "퍼포먼스", "종합 상담"] as const;

// 시트 '단계' 칸의 드롭다운 값 → 앱의 단계. 시트 값: 리드 · 연락됨 · 딜 (제안중) · 제안서 전달 · 견적서 전달 · 계약서 전달 · 성사 · 실패/종료 · 부재중.
// 계약서 전달은 아직 성사 전이라 제안 단계다('계약'이라는 글자가 있어도 계약 완료가 아니다). 옛 표기(계약·제안·상담)도 읽는다.
// 실패/종료는 단계가 아니라 별도 표시(failed)라서 여기서는 다루지 않는다. 리드·부재중·빈 값은 undefined(리드).
export function stageFromSheet(text: string): DealStage | undefined {
  if (/성사/.test(text) || /계약(?!서)/.test(text)) return "won";
  if (/딜|제안|견적|계약서/.test(text)) return "proposal";
  if (/연락됨|상담/.test(text)) return "discovery";
  return undefined;
}
export type ServiceLabel = (typeof SERVICE_LABELS)[number];

export const CHANNELS = ["홈페이지", "META", "유선", "기타"] as const;
export type LeadChannel = (typeof CHANNELS)[number];

export type LeadInquiry = {
  at: string; // ISO
  services: ServiceLabel[];
  channel: LeadChannel;
  budget?: string;
  text?: string;
};

// 시트의 한 문의 행. 시트에 쓸 때 "정확히 이 행이 맞는지" 확인하는 데 쓴다(행 번호만 믿지 않는다).
export type LeadRowRef = {
  row: number; // 1부터 시작하는 시트 행 번호
  stamp: string; // '날짜' 칸의 원문
  phone: string; // '연락처' 칸의 숫자만
  owner: string; // '담당자' 칸의 원문(충돌 검사용)
  stage: string; // '단계' 칸의 원문
  raw: Partial<Record<FieldKey, string>>; // 인트라넷이 기록하는 수기 칸의 원문(저장 시 충돌 검사용)
};

export type LeadRecord = {
  id: string;
  company: string;
  phone: string;
  email: string;
  services: ServiceLabel[];
  channel: LeadChannel;
  inquiries: LeadInquiry[]; // 오래된 순
  owner: string | null; // 앱의 영업 담당자로 매핑된 값. 없으면 null(미배정)
  originalOwner?: string; // 시트에 적힌 원래 담당자(앱 영업이 아닌 경우)
  lastContactAt?: string;
  retouchAt?: string;
  consult?: string;
  nextAction?: string;
  probability?: string;
  contractAmount?: string;
  failed?: boolean;
  failedAt?: string; // 종료로 표시된 행 중 가장 늦은 문의 시각
  reopened?: boolean; // 종료한 뒤에 다시 문의가 들어와 활성으로 되돌린 고객
  memo?: string;
  stage?: DealStage; // 시트 '단계' 칸에서 읽은 값(없으면 리드)
  rowRefs: LeadRowRef[]; // 시트에서 직접 읽었을 때만 채워진다
};

export type LeadParseStats = {
  rows: number; // 헤더 아래 모든 행
  imported: number; // 반영된 문의 행
  skippedEmpty: number;
  skippedTest: number;
  mergedRows: number; // 같은 연락처로 합쳐진 행 수
  badEmail: number;
  badPhone: number;
  errorCells: number; // #N/A 같은 수식 오류 셀
  invalidDate: number;
};

export type LeadParseResult =
  | { ok: true; records: LeadRecord[]; stats: LeadParseStats; missing: MissingColumn[] }
  | { ok: false; error: string };

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const ERROR_CELL = /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/i;

const clean = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return !v || v === "-" || ERROR_CELL.test(v) ? "" : v;
};

const ALIASES = {
  date: ["날짜", "접수일", "일시"],
  company: ["상호명", "상호", "회사명", "브랜드명"],
  phone: ["연락처", "전화번호", "휴대폰", "전화"],
  email: ["이메일", "email", "e-mail"],
  stage: ["단계"],
  service: ["서비스구분", "서비스"],
  channel: ["유입경로", "채널"],
  budget: ["예산"],
  inquiry: ["문의"],
  inquiryType: ["문의종류"],
  owner: ["담당자", "담당"],
  probability: ["가능성"],
  lastContact: ["최근연락일"],
  retouch: ["리터치일정"],
  consult: ["1차상담내용", "상담내용"],
  nextAction: ["다음액션플랜", "다음액션"],
  contract: ["계약금액"],
  memo: ["메모"],
} as const;

type ColKey = keyof typeof ALIASES;

// 시트에서 칸을 못 찾았을 때 화면에 알려 줄 내용. optional 칸(이메일·예산·문의·문의 종류)은 없어도 알리지 않는다.
const COLUMN_INFO: Record<ColKey, { label: string; impact: string; level: "important" | "optional" }> = {
  date: { label: "날짜", impact: "문의 시각을 알 수 없어 최근 문의와 응답 속도가 틀려집니다", level: "important" },
  company: { label: "상호명", impact: "", level: "important" },
  phone: { label: "연락처", impact: "같은 고객의 재문의를 합치지 못합니다", level: "important" },
  email: { label: "이메일", impact: "", level: "optional" },
  stage: { label: "단계", impact: "파이프라인 단계를 시트에서 읽고 쓸 수 없습니다", level: "important" },
  service: { label: "서비스 구분", impact: "서비스별 분석이 '미분류'로 나옵니다", level: "important" },
  channel: { label: "유입 경로", impact: "채널별 분석이 '기타'로 나옵니다", level: "important" },
  budget: { label: "예산", impact: "", level: "optional" },
  inquiry: { label: "문의", impact: "", level: "optional" },
  inquiryType: { label: "문의 종류", impact: "", level: "optional" },
  owner: { label: "담당자", impact: "담당 배정을 읽고 쓸 수 없습니다", level: "important" },
  probability: { label: "가능성", impact: "가능성을 읽고 쓸 수 없습니다", level: "important" },
  lastContact: { label: "최근 연락일", impact: "최근 연락일을 읽고 쓸 수 없습니다", level: "important" },
  retouch: { label: "리터치 일정", impact: "리터치 일정과 일정관리가 비어 보입니다", level: "important" },
  consult: { label: "1차 상담 내용", impact: "상담 히스토리를 읽고 쓸 수 없습니다", level: "important" },
  nextAction: { label: "다음 액션 플랜", impact: "다음 액션을 읽고 쓸 수 없습니다", level: "important" },
  contract: { label: "계약 금액", impact: "계약 금액과 계약 판정이 비어 보입니다", level: "important" },
  memo: { label: "메모", impact: "메모를 읽고 쓸 수 없습니다", level: "important" },
};

// 시트의 맨 윗줄에서 찾지 못한 칸(열 이름이 바뀌었거나 지워졌을 때). accepts는 인트라넷이 알아보는 이름들이다.
export type MissingColumn = { key: string; label: string; impact: string; accepts: string[] };

function pad(n: number | string, len = 2) {
  return String(n).padStart(len, "0");
}

// 문의 접수 일시 "2026-03-03 10:54" — 한국 시간으로 해석한다.
function parseInquiryDate(v: string): string | null {
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4] ?? 0)}:${m[5] ?? "00"}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "2026. 3. 12." · "2026.3.12" · "3/5/2026" 같은 손으로 적은 날짜 — 정오(한국 시간)로 둔다.
function parseLooseDate(v: string): string | null {
  const s = clean(v);
  if (!s) return null;
  let y: string | undefined, mo: string | undefined, d: string | undefined;
  let m = s.match(/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) [, mo, d, y] = m; // 시트의 M/D/YYYY
  if (!y || !mo || !d) return null;
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T12:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanPhone(v: string): { phone: string; valid: boolean } {
  const raw = v.trim().replace(/^p:\s*/i, "");
  if (!raw || ERROR_CELL.test(raw) || /phone_number/i.test(raw)) return { phone: "", valid: false };
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+82")) d = `0${d.slice(3)}`;
  else if (d.startsWith("82") && d.length >= 11) d = `0${d.slice(2)}`;
  d = d.replace(/\D/g, "");
  if (/^10\d{8}$/.test(d)) d = `0${d}`;
  if (/^01\d{8,9}$/.test(d)) {
    const phone = d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return { phone, valid: true };
  }
  if (/^0\d{8,10}$/.test(d)) return { phone: d, valid: true }; // 유선·대표번호
  return { phone: raw, valid: false };
}

function mapServices(...texts: string[]): ServiceLabel[] {
  const found = new Set<ServiceLabel>();
  for (const raw of texts) {
    for (const token of raw.split(/\s{2,}|[|,\n/]+/)) {
      const t = token.replace(/_/g, " ").toLowerCase().trim();
      if (!t) continue;
      if (/숏폼|영상|shorts?/.test(t)) found.add("숏폼");
      if (/인플루언서|시딩/.test(t)) found.add("인플루언서");
      if (/퍼포먼스/.test(t)) found.add("퍼포먼스");
      if (/종합/.test(t) && !/인플루언서|퍼포먼스|숏폼|영상/.test(t)) found.add("종합 상담");
    }
  }
  return SERVICE_LABELS.filter((l) => found.has(l));
}

function mapChannel(v: string): LeadChannel {
  const t = v.toLowerCase();
  if (t.includes("홈페이지")) return "홈페이지";
  if (t.includes("meta") || t.includes("메타")) return "META";
  if (t.includes("유선") || t.includes("전화")) return "유선";
  return "기타";
}

function mapOwner(v: string): { owner: string | null; original?: string } {
  const t = v.toLowerCase();
  if (!t) return { owner: null };
  // 영업 담당자의 영문 이름("이익재(Ian)"의 Ian)이 단어로 들어 있을 때만 같은 사람으로 본다.
  const hit = SALES_REPS.find((r) => {
    const en = r.toLowerCase().replace(/^.*\(/, "").replace(/\)$/, "");
    return new RegExp(`(^|[^a-z])${en}([^a-z]|$)`).test(t);
  });
  return hit ? { owner: hit } : { owner: null, original: v };
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const compact = (iso: string) => iso.replace(/\D/g, "").slice(0, 12);

function isYearMarker(row: string[]) {
  return /^20\d\d$/.test((row[0] ?? "").trim()) && !row.slice(1).some((c) => c.trim());
}

export function parseInquirySheet(text: string): LeadParseResult {
  // CSV 파일은 빈 행이 걸러져서 행 번호가 시트와 어긋난다. 그래서 행 참조는 만들지 않는다.
  return parseInquiryRows(parseCsv(text.replace(/^\uFEFF/, "")), false);
}

// 시트 값을 그대로(빈 행 포함) 받아 파싱한다. trackRows면 각 문의가 시트의 몇 번째 행인지 함께 기록한다.
export function parseInquiryRows(rows: string[][], trackRows = true): LeadParseResult {
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map(norm);
    return ALIASES.company.some((a) => cells.includes(a)) && (ALIASES.phone.some((a) => cells.includes(a)) || ALIASES.date.some((a) => cells.includes(a)));
  });
  if (headerIdx < 0) return { ok: false, error: "헤더 행을 찾지 못했습니다. '상호명'과 '연락처' 컬럼이 있는 시트인지 확인해 주세요." };

  const header = rows[headerIdx].map(norm);
  const col: Partial<Record<ColKey, number>> = {};
  for (const key of Object.keys(ALIASES) as ColKey[]) {
    const idx = header.findIndex((h) => (ALIASES[key] as readonly string[]).includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.company === undefined) return { ok: false, error: "'상호명' 컬럼이 없습니다." };
  const missing: MissingColumn[] = (Object.keys(ALIASES) as ColKey[])
    .filter((key) => col[key] === undefined && COLUMN_INFO[key].level === "important")
    .map((key) => ({ key, label: COLUMN_INFO[key].label, impact: COLUMN_INFO[key].impact, accepts: [...ALIASES[key]] }));

  const stats: LeadParseStats = {
    rows: 0, imported: 0, skippedEmpty: 0, skippedTest: 0, mergedRows: 0,
    badEmail: 0, badPhone: 0, errorCells: 0, invalidDate: 0,
  };
  const groups = new Map<string, LeadRecord>();
  let lastDate: string | null = null;

  const get = (row: string[], key: ColKey) => (col[key] === undefined ? "" : (row[col[key] as number] ?? "").trim());

  rows.slice(headerIdx + 1).forEach((row, i) => {
    if (!row.some((c) => c.trim())) return; // 빈 행
    if (row.map(norm).join("") === header.join("")) return; // 반복된 헤더
    if (isYearMarker(row)) return; // 연도 구분 행
    stats.rows++;
    stats.errorCells += row.filter((c) => ERROR_CELL.test(c.trim())).length;

    const company = clean(get(row, "company"));
    const phoneRaw = get(row, "phone");
    const channelRaw = clean(get(row, "channel"));
    if (/^test$/i.test(channelRaw) || /^(test|테스트)$/i.test(company) || /phone_number/i.test(phoneRaw)) {
      stats.skippedTest++;
      return;
    }
    const { phone, valid: phoneValid } = cleanPhone(phoneRaw);
    const emailRaw = clean(get(row, "email"));
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw.toLowerCase() : "";
    if (emailRaw && !email) stats.badEmail++;
    if (phoneRaw && !phoneValid) stats.badPhone++;
    if (!company && !phone && !email) {
      stats.skippedEmpty++;
      return;
    }

    let at = parseInquiryDate(get(row, "date"));
    if (!at) {
      stats.invalidDate++;
      at = lastDate; // 날짜가 깨진 행은 직전 행의 날짜를 쓴다(시트는 시간순)
    } else lastDate = at;
    const when = at ?? new Date().toISOString();

    const services = mapServices(clean(get(row, "service")), clean(get(row, "inquiryType")));
    const channel = channelRaw ? mapChannel(channelRaw) : "기타";
    const key = phoneValid ? `p:${phone.replace(/\D/g, "")}` : company || email ? `c:${company.replace(/\s+/g, "").toLowerCase()}|${email}` : `r:${i}`;
    const id = `lead-${phoneValid ? phone.replace(/\D/g, "") : hash(key)}`;

    const budget = clean(get(row, "budget"));
    const inquiryText = clean(get(row, "inquiry"));
    const inquiry: LeadInquiry = { at: when, services, channel, budget: budget || undefined, text: inquiryText || undefined };

    const existing = groups.get(key);
    stats.imported++;
    if (existing) stats.mergedRows++;
    const rec: LeadRecord = existing ?? { id, company, phone, email, services: [], channel, inquiries: [], owner: null, rowRefs: [] };
    rec.inquiries.push(inquiry);
    if (trackRows) {
      rec.rowRefs.push({
        row: headerIdx + 1 + i + 1,
        stamp: get(row, "date"),
        phone: phoneRaw.replace(/\D/g, ""),
        owner: get(row, "owner"),
        stage: get(row, "stage"),
        raw: {
          consult: get(row, "consult"),
          nextAction: get(row, "nextAction"),
          probability: get(row, "probability"),
          lastContact: get(row, "lastContact"),
          retouch: get(row, "retouch"),
          memo: get(row, "memo"),
          contract: get(row, "contract"),
        },
      });
    }
    rec.company = company || rec.company;
    rec.phone = phoneValid ? phone : rec.phone || phone;
    rec.email = email || rec.email;
    rec.channel = channel;
    rec.services = SERVICE_LABELS.filter((l) => rec.services.includes(l) || services.includes(l));

    const { owner, original } = mapOwner(clean(get(row, "owner")));
    if (owner) rec.owner = owner;
    else if (original && !rec.owner) rec.originalOwner = original;
    rec.lastContactAt = parseLooseDate(get(row, "lastContact")) ?? rec.lastContactAt;
    rec.retouchAt = parseLooseDate(get(row, "retouch")) ?? rec.retouchAt;
    rec.consult = clean(get(row, "consult")) || rec.consult;
    rec.nextAction = clean(get(row, "nextAction")) || rec.nextAction;
    rec.probability = clean(get(row, "probability")).replace(/%+$/, "%") || rec.probability;
    rec.contractAmount = clean(get(row, "contract")) || rec.contractAmount;
    rec.memo = clean(get(row, "memo")) || rec.memo;
    const stageText = clean(get(row, "stage"));
    if (/실패|종료/.test(stageText)) {
      rec.failed = true;
      if (!rec.failedAt || when > rec.failedAt) rec.failedAt = when;
    }
    // 같은 고객의 여러 행 중 가장 앞선 단계를 쓴다(계약 > 제안 > 상담)
    const rowStage = stageFromSheet(stageText);
    if (rowStage === "won") rec.stage = "won";
    else if (rowStage === "proposal" && rec.stage !== "won") rec.stage = "proposal";
    else if (rowStage === "discovery" && !rec.stage) rec.stage = "discovery";
    groups.set(key, rec);
  });

  const records = Array.from(groups.values());
  for (const r of records) r.inquiries.sort((a, b) => a.at.localeCompare(b.at));
  // 종료한 고객이 다시 문의하면(종료한 행보다 나중 문의가 있으면) 숨기지 않고 활성 고객으로 되살린다.
  for (const r of records) {
    if (r.failed && r.failedAt && (r.inquiries[r.inquiries.length - 1]?.at ?? "") > r.failedAt) {
      r.failed = false;
      r.reopened = true;
    }
  }
  return { ok: true, records, stats, missing };
}

// 리드 기록 → 앱의 고객(리드 단계). 영업이 앱에서 나중에 바꾸는 값(담당·단계 등)은 병합 때 보존한다.
export function recordToCustomer(r: LeadRecord, nowIso = new Date().toISOString()): Customer {
  const owner = r.owner ?? UNASSIGNED;
  const first = r.inquiries[0]?.at ?? nowIso;
  const last = r.inquiries[r.inquiries.length - 1]?.at ?? nowIso;
  const lastActivityAt = [last, r.lastContactAt].filter(Boolean).sort().pop() as string;

  const tags = ["문의DB", r.channel];
  if (r.inquiries.length > 1) tags.push(`재문의 ${r.inquiries.length - 1}회`);
  if (r.originalOwner && !r.owner) tags.push(`이전 담당: ${r.originalOwner}`);
  if (r.probability) tags.push(`가능성 ${r.probability}`);
  if (r.contractAmount) tags.push(`계약금액 ${r.contractAmount}`);
  if (r.failed) tags.push("실패/종료");
  if (r.reopened) tags.push("종료 후 재문의");

  const seen = new Map<string, number>();
  const inquiryActs: Activity[] = r.inquiries.map((q) => {
    const stamp = compact(q.at);
    const n = (seen.get(stamp) ?? 0) + 1;
    seen.set(stamp, n);
    return {
      id: `${r.id}-q-${stamp}${n > 1 ? `-${n}` : ""}`,
      type: "system",
      summary: `문의 접수 · ${q.services.length ? q.services.join("·") : "서비스 미기재"} · ${q.channel}`,
      detail: [q.budget ? `예산 ${q.budget}` : "", q.text ?? ""].filter(Boolean).join("\n") || undefined,
      at: q.at,
      author: "문의 DB",
    };
  });
  const manual: Activity[] = [];
  if (r.consult) manual.push({ id: `${r.id}-n-${hash(r.consult)}`, type: "note", summary: "1차 상담 내용", detail: r.consult.slice(0, 1000), at: r.lastContactAt ?? last, author: r.owner ?? "시트" });
  if (r.memo) manual.push({ id: `${r.id}-m-${hash(r.memo)}`, type: "note", summary: "메모", detail: r.memo.slice(0, 600), at: r.lastContactAt ?? last, author: r.owner ?? "시트" });

  return {
    id: r.id,
    company: r.company || "상호 미기재",
    category: r.services.length ? r.services.join(" · ") : "미분류",
    website: "-",
    // 단계 칸을 안 쓰는 시트가 많아서, 단계가 비어 있어도 계약 금액이 적혀 있으면 계약으로 본다(실패/종료는 제외).
    stage: r.stage ?? (!r.failed && /[1-9]/.test((r.contractAmount ?? "").replace(/\D/g, "")) ? "won" : "lead"),
    dealValueMonthly: 0,
    source: "inbound",
    owner,
    manager: "담당자 미정",
    email: r.email,
    phone: r.phone,
    createdAt: first,
    lastActivityAt,
    nextStep: r.nextAction ?? (owner === UNASSIGNED ? "담당자 배정 필요" : "첫 컨택 필요"),
    nextStepDue: r.retouchAt,
    contacts: [],
    activities: [...manual, ...inquiryActs].sort((a, b) => b.at.localeCompare(a.at)),
    tags,
    operationStatus: "not_started",
  };
}

// 시트에서 다시 가져올 때 쓰는 병합: 앱에서 영업이 바꾼 값(담당·단계·태그·메모)은 지키고, 새 문의 이력만 더한다.
const DYNAMIC_TAG = /^(재문의 \d+회|가능성 |계약금액 |이전 담당: |실패\/종료$|종료 후 재문의$)/;
const PLACEHOLDER_NEXT = new Set(["첫 컨택 필요", "담당자 배정 필요"]);

export function mergeImportedCustomer(existing: Customer, incoming: Customer): Customer {
  const have = new Set(existing.activities.map((a) => a.id));
  const added = incoming.activities.filter((a) => !have.has(a.id));
  const owner = existing.owner === UNASSIGNED && incoming.owner !== UNASSIGNED ? incoming.owner : existing.owner;
  const nextStep = !existing.nextStep || PLACEHOLDER_NEXT.has(existing.nextStep) ? incoming.nextStep : existing.nextStep;
  return {
    ...existing,
    owner,
    category: existing.category === "미분류" ? incoming.category : existing.category,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    createdAt: incoming.createdAt < existing.createdAt ? incoming.createdAt : existing.createdAt,
    lastActivityAt: incoming.lastActivityAt > existing.lastActivityAt ? incoming.lastActivityAt : existing.lastActivityAt,
    nextStep,
    nextStepDue: existing.nextStepDue ?? incoming.nextStepDue,
    tags: Array.from(new Set([...existing.tags.filter((t) => !DYNAMIC_TAG.test(t)), ...incoming.tags])),
    activities: [...added, ...existing.activities].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// 미배정 리드를 현재 맡은 건수가 적은 영업부터 번갈아 배정한다.
export function planBalancedAssignment(ids: string[], counts: Record<string, number>): Record<string, string[]> {
  const load: Record<string, number> = {};
  const plan: Record<string, string[]> = {};
  for (const rep of SALES_REPS) {
    load[rep] = counts[rep] ?? 0;
    plan[rep] = [];
  }
  for (const id of ids) {
    const rep = SALES_REPS.reduce((a, b) => (load[b] < load[a] ? b : a));
    plan[rep].push(id);
    load[rep]++;
  }
  return plan;
}
