// 영업 담당자 목록. 담당자 배정 전의 리드는 UNASSIGNED로 둔다.
export const SALES_REPS = ["이익재(Ian)", "김세현(Connor)"] as const;

// 관리자 기본값. 환경변수 LEADS_ADMINS(쉼표로 구분한 이름)로 바꿀 수 있다. 관리자는 팀 공용 화면 설정과 다른 사람의 월 목표를 바꿀 수 있다.
export const DEFAULT_ADMINS: readonly string[] = ["김세현(Connor)"];

export const UNASSIGNED = "미배정";

// 담당 영업 선택지(배정 안 함 포함)
export const OWNER_OPTIONS: readonly string[] = [UNASSIGNED, ...SALES_REPS];
