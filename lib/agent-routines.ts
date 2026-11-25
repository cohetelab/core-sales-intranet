import dayjs from "dayjs";

import type { Campaign } from "@/lib/campaign-store";
import type { Customer } from "@/lib/types";

export type RoutineId = "weekly" | "followup" | "deadlines";
export type ReviewStatus = "pending" | "approved" | "needs_changes";
export type RoutineItem = { id: string; title: string; detail: string; href: string; sample: boolean; evidence?: string[] };
export type AiReportLine = { text: string; sourceIds: string[]; evidenceQuote: string };
export type AiWeeklyDraft = {
  model: string;
  generatedAt: string;
  summary: AiReportLine[];
  priorities: AiReportLine[];
  nextActions: AiReportLine[];
  needsVerification: string[];
  coverage?: { totalSources: number; includedSources: number; totalEvidence: number; includedEvidence: number; clipped: boolean };
};
export type RoutineRun = {
  id: string;
  routineId: RoutineId;
  runAt: string;
  basis: string;
  sourceCount: number;
  sampleCount: number;
  status: "success" | "empty" | "failed";
  summary: string;
  items: RoutineItem[];
  error?: string;
  review: ReviewStatus;
  reviewNote: string;
  reviewedAt?: string;
  aiDraft?: AiWeeklyDraft;
};

export const ROUTINES: { id: RoutineId; title: string; description: string; source: string }[] = [
  { id: "weekly", title: "주간 영업 보고 초안", description: "최근 7일의 고객사 활동과 다음 액션을 정리합니다.", source: "고객사" },
  { id: "followup", title: "후속 연락 점검", description: "기한이 지났거나 3일 이내인 고객사 다음 액션을 찾습니다.", source: "고객사" },
  { id: "deadlines", title: "캠페인 업무 마감 점검", description: "미완료 업무 중 기한이 지났거나 3일 이내인 항목을 찾습니다.", source: "캠페인 업무" },
];

const sampleCustomer = (id: string) => /^c\d+$/.test(id);
const dateLabel = (value: string) => dayjs(value).format("YYYY.MM.DD");

export function executeRoutine(routineId: RoutineId, customers: Customer[], campaigns: Campaign[], now = new Date()): RoutineRun {
  const today = dayjs(now);
  const run: RoutineRun = {
    id: crypto.randomUUID(), routineId, runAt: now.toISOString(), basis: "", sourceCount: 0,
    sampleCount: 0, status: "empty", summary: "", items: [], review: "pending", reviewNote: "",
  };

  try {
    if (routineId === "weekly") {
      const from = today.subtract(7, "day");
      const inRange = (value: string) => dayjs(value).isValid() && !dayjs(value).isBefore(from) && !dayjs(value).isAfter(today);
      const relevant = customers.filter((customer) =>
        customer.activities.some((activity) => inRange(activity.at)) || inRange(customer.createdAt)
      );
      run.basis = `${dateLabel(from.toISOString())} ~ ${dateLabel(run.runAt)} · 고객사 ${customers.length}곳`;
      run.sourceCount = relevant.length;
      run.sampleCount = relevant.filter((customer) => sampleCustomer(customer.id)).length;
      run.items = relevant.map((customer) => ({
        id: customer.id, title: customer.company, detail: "이번 기간 활동 또는 신규 등록", href: `/customers?id=${encodeURIComponent(customer.id)}`, sample: sampleCustomer(customer.id),
        evidence: [
          ...(inRange(customer.createdAt) ? [`${dateLabel(customer.createdAt)} 신규 등록`] : []),
          ...customer.activities.filter((activity) => inRange(activity.at)).sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf())
            .slice(0, 8).map((activity) => `${dateLabel(activity.at)} ${activity.summary}`),
          ...(customer.nextStep?.trim() ? [`다음 액션: ${customer.nextStep}${customer.nextStepDue ? ` (${dateLabel(customer.nextStepDue)})` : ""}`] : []),
        ],
      }));
      run.status = relevant.length ? "success" : "empty";
      run.summary = relevant.length
        ? run.items.map((item) => `${item.title}${item.sample ? " (샘플)" : ""}\n${item.evidence!.map((text) => `- ${text}`).join("\n")}`).join("\n\n")
        : "최근 7일에 등록되거나 활동이 기록된 고객사가 없습니다. 고객사 화면에서 활동을 기록한 뒤 다시 실행해 주세요.";
    } else if (routineId === "followup") {
      const until = today.add(3, "day");
      const due = customers.filter((customer) => customer.nextStep?.trim() && customer.nextStepDue &&
        dayjs(customer.nextStepDue).isValid() && !dayjs(customer.nextStepDue).isAfter(until, "day"));
      due.sort((a, b) => (a.nextStepDue ?? "").localeCompare(b.nextStepDue ?? ""));
      run.basis = `${dateLabel(run.runAt)} 기준 · 3일 이내 및 기한 경과 · 고객사 ${customers.length}곳`;
      run.sourceCount = customers.length;
      run.sampleCount = due.filter((customer) => sampleCustomer(customer.id)).length;
      run.items = due.map((customer) => ({
        id: customer.id, title: customer.company,
        detail: `${dateLabel(customer.nextStepDue!)} · ${customer.nextStep}${dayjs(customer.nextStepDue).isBefore(today, "day") ? " · 기한 경과" : ""}`,
        href: `/customers?id=${encodeURIComponent(customer.id)}`, sample: sampleCustomer(customer.id),
      }));
      run.status = due.length ? "success" : "empty";
      run.summary = due.length ? `${due.length}곳의 후속 연락을 확인해 주세요.` : "3일 이내 또는 기한이 지난 후속 연락이 없습니다.";
    } else {
      const until = today.add(3, "day");
      const total = campaigns.reduce((count, campaign) => count + (campaign.tasks?.length ?? 0), 0);
      const due = campaigns.flatMap((campaign) => (campaign.tasks ?? [])
        .filter((task) => task.status !== "done" && task.dueDate && dayjs(task.dueDate).isValid() && !dayjs(task.dueDate).isAfter(until, "day"))
        .map((task) => ({ campaign, task })));
      due.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
      run.basis = `${dateLabel(run.runAt)} 기준 · 3일 이내 및 기한 경과 · 업무 ${total}건`;
      run.sourceCount = total;
      run.sampleCount = due.filter(({ campaign }) => campaign.id === "camp-demo").length;
      run.items = due.map(({ campaign, task }) => ({
        id: `${campaign.id}:${task.id}`, title: task.title,
        detail: `${campaign.name} · ${dateLabel(task.dueDate)}${task.assignee ? ` · ${task.assignee}` : ""}${dayjs(task.dueDate).isBefore(today, "day") ? " · 기한 경과" : ""}`,
        href: `/campaigns/${encodeURIComponent(campaign.id)}`, sample: campaign.id === "camp-demo",
      }));
      run.status = due.length ? "success" : "empty";
      run.summary = due.length ? `${due.length}건의 캠페인 업무를 확인해 주세요.` : "3일 이내 또는 기한이 지난 미완료 업무가 없습니다. 캠페인 업무 보드에서 업무와 마감일을 등록할 수 있습니다.";
    }
  } catch (error) {
    run.status = "failed";
    run.summary = "실행 결과를 만들지 못했습니다. 원본 데이터를 확인한 뒤 다시 실행해 주세요.";
    run.error = error instanceof Error ? error.message : "알 수 없는 오류";
    run.items = [];
  }
  return run;
}
