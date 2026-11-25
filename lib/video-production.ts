export const PRODUCTION_STAGES = ["planning", "shooting", "editing", "review", "published", "metrics"] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const PRODUCTION_STAGE_LABEL: Record<ProductionStage, string> = {
  planning: "기획", shooting: "촬영", editing: "편집", review: "고객사 검수", published: "게시", metrics: "성과 입력",
};

export type VideoProduction = {
  stage: ProductionStage;
  assignee: string;
  dueDate: string;
  revisionCount: number;
  approvedAt: string;
  note: string;
  updatedAt: string;
};

export function defaultProduction(resultUrl: string, hasMetrics: boolean): VideoProduction {
  return {
    stage: resultUrl ? (hasMetrics ? "metrics" : "published") : "planning",
    assignee: "",
    dueDate: "",
    revisionCount: 0,
    approvedAt: "",
    note: "",
    updatedAt: "",
  };
}

export function isOverdue(production: VideoProduction, today: string) {
  return Boolean(production.dueDate && production.dueDate < today && !["published", "metrics"].includes(production.stage));
}
