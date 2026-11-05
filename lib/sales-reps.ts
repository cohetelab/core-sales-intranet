// 영업 담당자 목록. 담당자 배정 전의 리드는 UNASSIGNED로 둔다.
export const SALES_REPS = ["이익재(Ian)", "김세현(Connor)"] as const;

export const UNASSIGNED = "미배정";

// 담당 영업 선택지(배정 안 함 포함)
export const OWNER_OPTIONS: readonly string[] = [UNASSIGNED, ...SALES_REPS];
