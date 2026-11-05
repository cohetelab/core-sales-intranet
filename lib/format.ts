import dayjs from "dayjs";

// 데모 데이터가 가정하는 "오늘" — 목업 시나리오(리드 생성일, 마감일 등)가
// 전부 이 날짜를 기준으로 짜여 있다. 실제 데모 날짜가 한참 지나면 마감일이
// 죄다 지난 것처럼 보이니, 데모 직전엔 이 값을 오늘 날짜 근처로 갱신한다.
export const DEMO_TODAY = dayjs("2026-09-20T18:00:00+09:00");

export function formatKRW(value: number) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}억원`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

export function formatDate(iso: string, format = "MM.DD") {
  return dayjs(iso).format(format);
}

export function formatDateTime(iso: string) {
  return dayjs(iso).format("MM.DD HH:mm");
}

// 한국 시간으로 고정해서 "26.11.05 14:23"(withYear=false면 "11.05 14:23")로 보여 준다.
// 문의 시각은 시트의 한국 시간이라, 보는 사람의 브라우저 위치에 따라 달라지면 안 된다.
export function formatKst(iso: string, withYear = true) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${withYear ? `${get("year")}.` : ""}${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

export function timeAgo(iso: string, now = DEMO_TODAY) {
  const d = now.diff(dayjs(iso), "minute");
  if (d < 60) return `${Math.max(d, 0)}분 전`;
  const h = now.diff(dayjs(iso), "hour");
  if (h < 24) return `${h}시간 전`;
  const days = now.diff(dayjs(iso), "day");
  return `${days}일 전`;
}
