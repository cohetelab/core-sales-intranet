import "server-only";

import { del, get, list, put } from "@vercel/blob";

export type SharedCreator = {
  handle: string;
  platform: "instagram" | "tiktok";
  profileImageUrl: string;
  followers: number;
  engagementRate: number;
  avgViews: number | null;
  category: string[];
  bio: string;
};

export type ShareSnapshot = {
  id: string;
  campaignId: string;
  campaignName: string;
  brand: string;
  product: string;
  goal: string;
  message: string;
  createdAt: string;
  creators: SharedCreator[];
};

const pathname = (id: string) => `campaign-shares/${id}.json`;
const validId = (id: string) => /^[a-f0-9]{32}$/.test(id);

export function parseShareInput(input: unknown): Omit<ShareSnapshot, "id" | "createdAt"> | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (typeof data.campaignId !== "string" || data.campaignId.length > 100) return null;
  if (typeof data.campaignName !== "string" || !data.campaignName.trim() || data.campaignName.length > 160) return null;
  if (typeof data.brand !== "string" || data.brand.length > 120) return null;
  if (!Array.isArray(data.creators) || data.creators.length < 1 || data.creators.length > 50) return null;
  const creators: SharedCreator[] = [];
  for (const row of data.creators) {
    if (!row || typeof row !== "object") return null;
    const c = row as Record<string, unknown>;
    if (typeof c.handle !== "string" || !c.handle.trim() || c.handle.length > 80) return null;
    if (c.platform !== "instagram" && c.platform !== "tiktok") return null;
    const photo = typeof c.profileImageUrl === "string" ? c.profileImageUrl : "";
    if (photo.length > 200_000 || (photo && !/^https?:\/\//.test(photo) && !/^data:image\/jpeg;base64,/.test(photo))) return null;
    if (typeof c.followers !== "number" || !Number.isFinite(c.followers) || c.followers < 0) return null;
    if (typeof c.engagementRate !== "number" || !Number.isFinite(c.engagementRate) || c.engagementRate < 0) return null;
    if (c.avgViews !== null && (typeof c.avgViews !== "number" || !Number.isFinite(c.avgViews) || c.avgViews < 0)) return null;
    if (!Array.isArray(c.category) || c.category.length > 10 || c.category.some((v) => typeof v !== "string" || v.length > 40)) return null;
    if (typeof c.bio !== "string" || c.bio.length > 600) return null;
    creators.push({
      handle: c.handle.trim(), platform: c.platform, profileImageUrl: photo,
      followers: c.followers, engagementRate: c.engagementRate,
      avgViews: c.avgViews, category: c.category, bio: c.bio,
    });
  }
  return {
    campaignId: data.campaignId,
    campaignName: data.campaignName.trim(),
    brand: data.brand.trim(),
    product: typeof data.product === "string" ? data.product.slice(0, 160) : "",
    goal: typeof data.goal === "string" ? data.goal.slice(0, 300) : "",
    message: typeof data.message === "string" ? data.message.slice(0, 500) : "",
    creators,
  };
}

export async function createShare(input: Omit<ShareSnapshot, "id" | "createdAt">) {
  const snapshot: ShareSnapshot = { ...input, id: crypto.randomUUID().replaceAll("-", ""), createdAt: new Date().toISOString() };
  await put(pathname(snapshot.id), JSON.stringify(snapshot), {
    access: "private", contentType: "application/json", addRandomSuffix: false,
  });
  return snapshot;
}

export async function getShare(id: string): Promise<ShareSnapshot | null> {
  if (!validId(id)) return null;
  const result = await get(pathname(id), { access: "private", useCache: false });
  if (result?.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text()) as ShareSnapshot;
}

export async function listShares(): Promise<ShareSnapshot[]> {
  const snapshots: ShareSnapshot[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "campaign-shares/", limit: 100, cursor });
    const items = await Promise.all(page.blobs.map(async (blob) => {
      const id = blob.pathname.split("/").pop()?.replace(/\.json$/, "") ?? "";
      return getShare(id);
    }));
    snapshots.push(...items.filter((item): item is ShareSnapshot => item !== null));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteShare(id: string) {
  if (!validId(id)) return false;
  if (!(await getShare(id))) return false;
  await del(pathname(id));
  return true;
}
