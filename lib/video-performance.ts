export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "other";
export type VideoFormat = "review" | "tutorial" | "comparison" | "story" | "other";

export type VideoCreative = {
  platform: VideoPlatform;
  hook: string;
  format: VideoFormat;
  cta: string;
  durationSeconds: number | null;
  averageWatchSeconds: number | null;
  completionRate: number | null;
};

export const EMPTY_VIDEO_CREATIVE: VideoCreative = {
  platform: "other",
  hook: "",
  format: "other",
  cta: "",
  durationSeconds: null,
  averageWatchSeconds: null,
  completionRate: null,
};

export const PLATFORM_LABEL: Record<VideoPlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", other: "기타",
};

export const FORMAT_LABEL: Record<VideoFormat, string> = {
  review: "리뷰", tutorial: "사용법", comparison: "비교", story: "스토리", other: "기타",
};

export function platformFromUrl(value: string): VideoPlatform {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return "youtube";
  } catch { /* URL을 입력하기 전에는 기타로 둡니다. */ }
  return "other";
}
