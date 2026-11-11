import type { Influencer } from "@/lib/influencer-data";
import { matchCreators, type CreatorMatch } from "@/lib/agents";

export type MatchPlaybook = {
  version: number;
  maxResults: number;
  minFollowers: number;
  maxFollowers: number;
  minEngagementRate: number;
  excludedCategories: string[];
};

export type MatchResult = {
  creatorId: string;
  handle: string;
  followers: number;
  engagementRate: number;
  categories: string[];
  score: number;
  reasons: string[];
  failures: string[];
  feedback: string;
};

export type MatchRun = {
  id: string;
  createdAt: string;
  brief: string;
  playbook: MatchPlaybook;
  results: MatchResult[];
  failures: string[];
};

export const DEFAULT_MATCH_PLAYBOOK: MatchPlaybook = {
  version: 1,
  maxResults: 5,
  minFollowers: 0,
  maxFollowers: 0,
  minEngagementRate: 0,
  excludedCategories: [],
};

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeMatchPlaybook(value: unknown): MatchPlaybook {
  const raw = value && typeof value === "object" ? value as Partial<MatchPlaybook> : {};
  return {
    version: Math.max(1, Math.floor(finite(raw.version, 1))),
    maxResults: Math.min(50, Math.max(1, Math.floor(finite(raw.maxResults, 5)))),
    minFollowers: Math.max(0, Math.floor(finite(raw.minFollowers, 0))),
    maxFollowers: Math.max(0, Math.floor(finite(raw.maxFollowers, 0))),
    minEngagementRate: Math.min(100, Math.max(0, finite(raw.minEngagementRate, 0))),
    excludedCategories: Array.isArray(raw.excludedCategories)
      ? [...new Set(raw.excludedCategories.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
      : [],
  };
}

export function validateMatchPlaybook(playbook: MatchPlaybook): string | null {
  if (!Number.isInteger(playbook.maxResults) || playbook.maxResults < 1 || playbook.maxResults > 50) {
    return "추천 인원은 1~50명으로 입력해 주세요.";
  }
  if (!Number.isFinite(playbook.minFollowers) || !Number.isFinite(playbook.maxFollowers) || playbook.minFollowers < 0 || playbook.maxFollowers < 0) {
    return "팔로워 조건은 0 이상의 숫자로 입력해 주세요.";
  }
  if (!Number.isFinite(playbook.minEngagementRate) || playbook.minEngagementRate < 0 || playbook.minEngagementRate > 100) {
    return "최소 참여율은 0~100%로 입력해 주세요.";
  }
  if (playbook.maxFollowers > 0 && playbook.maxFollowers < playbook.minFollowers) {
    return "최대 팔로워는 최소 팔로워 이상이어야 합니다.";
  }
  return null;
}

export function checkMatchResult(match: CreatorMatch, playbook: MatchPlaybook): string[] {
  const { creator, reasons } = match;
  const excluded = playbook.excludedCategories.some((excludedCategory) =>
    creator.category.some((category) => category.toLowerCase().includes(excludedCategory.toLowerCase()))
  );
  return [
    ...(creator.optOut ? ["제외 요청 크리에이터"] : []),
    ...(excluded ? ["제외 카테고리 포함"] : []),
    ...(creator.followers < playbook.minFollowers || (playbook.maxFollowers > 0 && creator.followers > playbook.maxFollowers) ? ["팔로워 조건 미충족"] : []),
    ...(creator.engagementRate < playbook.minEngagementRate ? ["참여율 조건 미충족"] : []),
    ...(reasons.length === 0 ? ["추천 근거 누락"] : []),
  ];
}

export function runMatchPlaybook(brief: string, pool: Influencer[], playbook: MatchPlaybook): MatchRun {
  const eligible = pool.filter((creator) =>
    !creator.optOut &&
    creator.followers >= playbook.minFollowers &&
    (playbook.maxFollowers === 0 || creator.followers <= playbook.maxFollowers) &&
    creator.engagementRate >= playbook.minEngagementRate &&
    !playbook.excludedCategories.some((excludedCategory) =>
      creator.category.some((category) => category.toLowerCase().includes(excludedCategory.toLowerCase()))
    )
  );
  const matches = matchCreators(brief, eligible, playbook.maxResults);
  const seen = new Set<string>();
  const results: MatchResult[] = matches.map((match) => {
    const duplicate = seen.has(match.creator.id);
    seen.add(match.creator.id);
    return {
      creatorId: match.creator.id,
      handle: match.creator.handle,
      followers: match.creator.followers,
      engagementRate: match.creator.engagementRate,
      categories: [...match.creator.category],
      score: match.score,
      reasons: [...match.reasons],
      failures: [...checkMatchResult(match, playbook), ...(duplicate ? ["중복 추천"] : [])],
      feedback: "",
    };
  });
  return {
    id: `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    brief: brief.trim(),
    playbook: { ...playbook, excludedCategories: [...playbook.excludedCategories] },
    results,
    failures: results.length ? [] : ["조건에 맞는 추천 결과 없음"],
  };
}
