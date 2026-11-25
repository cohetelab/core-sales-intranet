import type { AiReportLine, AiWeeklyDraft, RoutineRun } from "./agent-routines";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const lines = (value: unknown): value is AiReportLine[] => Array.isArray(value) && value.every((item) => object(item) && typeof item.text === "string" && strings(item.sourceIds) && typeof item.evidenceQuote === "string");

export function isAiWeeklyDraft(value: unknown): value is AiWeeklyDraft {
  if (!object(value) || typeof value.model !== "string" || !date(value.generatedAt) || !lines(value.summary) || !lines(value.priorities) || !lines(value.nextActions) || !strings(value.needsVerification)) return false;
  if (value.coverage !== undefined) {
    const coverage = value.coverage;
    if (!object(coverage) || typeof coverage.clipped !== "boolean" || ![coverage.totalSources, coverage.includedSources, coverage.totalEvidence, coverage.includedEvidence].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) return false;
  }
  return true;
}

export function readRoutineHistory(raw: string | null): { runs: RoutineRun[]; damaged: boolean } {
  if (!raw) return { runs: [], damaged: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { runs: [], damaged: true }; }
  if (!Array.isArray(parsed)) return { runs: [], damaged: true };
  const runs: RoutineRun[] = [];
  for (const item of parsed) {
    if (!object(item) || ![item.sourceCount, item.sampleCount].every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0) || (item.error !== undefined && typeof item.error !== "string")) continue;
    if (!object(item) || typeof item.id !== "string" || !["weekly", "followup", "deadlines"].includes(String(item.routineId)) || !date(item.runAt) || typeof item.summary !== "string" || typeof item.basis !== "string" || !["success", "empty", "failed"].includes(String(item.status)) || !Array.isArray(item.items) || !item.items.every((source) => object(source) && typeof source.id === "string" && typeof source.title === "string" && typeof source.detail === "string" && typeof source.href === "string" && /^\/(?:customers\?id=|campaigns\/)/.test(source.href) && typeof source.sample === "boolean" && (source.evidence === undefined || strings(source.evidence))) || (item.aiDraft !== undefined && !isAiWeeklyDraft(item.aiDraft))) continue;
    runs.push({ ...item, review: ["pending", "approved", "needs_changes"].includes(String(item.review)) ? item.review : "pending", reviewNote: typeof item.reviewNote === "string" ? item.reviewNote : "", reviewedAt: date(item.reviewedAt) ? item.reviewedAt : undefined } as RoutineRun);
  }
  return { runs, damaged: runs.length !== parsed.length };
}
