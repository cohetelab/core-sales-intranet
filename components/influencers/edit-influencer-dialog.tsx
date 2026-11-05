"use client";

import * as React from "react";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLATFORM_LABEL,
  type Influencer,
  type InfluencerPlatform,
} from "@/lib/influencer-data";
import { useInfluencerStore, type InfluencerInput } from "@/lib/influencer-store";
import { InfluencerPhotoField, isValidPhotoSource } from "@/components/influencers/influencer-photo-field";

function toForm(c: Influencer) {
  return {
    handle: c.handle,
    profileImageUrl: c.profileImageUrl ?? "",
    country: c.country ?? "",
    recentPosts: Array.from({ length: 3 }, (_, i) => c.recentPosts?.[i] ?? { url: "", thumbnailUrl: "" }),
    extraMetrics: c.extraMetrics ?? [],
    platform: c.platform,
    followers: String(c.followers),
    engagementRate: String(c.engagementRate),
    avgViews: c.avgViews != null ? String(c.avgViews) : "",
    gender: c.gender,
    category: c.category.join(", "),
    bio: c.bio,
    pinned: c.pinned,
    optOut: c.optOut,
  };
}

export function EditInfluencerDialog({
  influencer,
  trigger,
}: {
  influencer: Influencer;
  trigger?: React.ReactNode;
}) {
  const { updateInfluencer } = useInfluencerStore();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(() => toForm(influencer));
  const [photoError, setPhotoError] = React.useState("");
  const [postError, setPostError] = React.useState("");

  // 다이얼로그를 여는 시점(이벤트)에 최신 값으로 리셋 — effect가 아니라
  // onOpenChange 핸들러에서 처리한다 (customer-store 쪽과 동일한 이유).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setForm(toForm(influencer));
    if (next) setPhotoError("");
    if (next) setPostError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.handle.trim()) return;
    if (!isValidPhotoSource(form.profileImageUrl.trim())) {
      setPhotoError("http 또는 https 사진 URL을 입력해 주세요.");
      return;
    }
    const invalidPost = form.recentPosts.some((post) => {
      if (!post.url.trim() && !post.thumbnailUrl.trim()) return false;
      try {
        const link = new URL(post.url.trim());
        const image = new URL(post.thumbnailUrl.trim());
        return ![link, image].every((url) => url.protocol === "http:" || url.protocol === "https:");
      } catch { return true; }
    });
    if (invalidPost) {
      setPostError("게시물 주소와 이미지 주소를 모두 http 또는 https URL로 입력해 주세요.");
      return;
    }
    const input: InfluencerInput = {
      handle: form.handle.trim().replace(/^@/, ""),
      profileImageUrl: form.profileImageUrl.trim(),
      country: form.country.trim(),
      recentPosts: form.recentPosts.filter((p) => p.url.trim() && p.thumbnailUrl.trim()),
      extraMetrics: form.extraMetrics,
      platform: form.platform,
      followers: Number(form.followers) || 0,
      engagementRate: Number(form.engagementRate) || 0,
      avgViews: form.avgViews ? Number(form.avgViews) : null,
      gender: form.gender,
      category: form.category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      bio: form.bio,
      source: influencer.source,
      pinned: form.pinned,
      optOut: form.optOut,
    };
    updateInfluencer(influencer.id, input);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-8">
            <PencilIcon className="size-3.5" /> 수정
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>크리에이터 정보 수정</DialogTitle>
            <DialogDescription>
              @{influencer.handle}의 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <InfluencerPhotoField
              id="edit-inf-photo"
              handle={form.handle}
              value={form.profileImageUrl}
              onChange={(value) => { setForm((f) => ({ ...f, profileImageUrl: value })); setPhotoError(""); }}
            />
            {photoError && <p className="text-xs text-destructive" role="alert">{photoError}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="edit-inf-country">국가</Label>
              <Input id="edit-inf-country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="예: 대한민국" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-inf-handle">핸들 *</Label>
                <Input
                  id="edit-inf-handle"
                  value={form.handle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, handle: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>플랫폼</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, platform: v as InfluencerPlatform }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLATFORM_LABEL) as InfluencerPlatform[]).map(
                      (p) => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_LABEL[p]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-inf-followers">팔로워</Label>
                <Input
                  id="edit-inf-followers"
                  type="number"
                  min={0}
                  value={form.followers}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, followers: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inf-eng">참여율 (%)</Label>
                <Input
                  id="edit-inf-eng"
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.engagementRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, engagementRate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-inf-views">평균 조회수</Label>
                <Input
                  id="edit-inf-views"
                  type="number"
                  min={0}
                  value={form.avgViews}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, avgViews: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-inf-category">카테고리 (콤마로 구분)</Label>
                <Input
                  id="edit-inf-category"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>성별</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, gender: v as "male" | "female" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">여성</SelectItem>
                    <SelectItem value="male">남성</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-inf-bio">소개</Label>
              <Textarea
                id="edit-inf-bio"
                rows={2}
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">실제 게시물 (최대 3개)</p>
              <p className="text-xs text-muted-foreground">게시물 주소와 공개 이미지 주소를 함께 입력하면 탐색 카드에 표시됩니다.</p>
              {postError && <p className="text-xs text-destructive" role="alert">{postError}</p>}
              {form.recentPosts.map((post, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input aria-label={`게시물 ${index + 1} 주소`} placeholder="게시물 https://..." value={post.url} onChange={(e) => setForm((f) => ({ ...f, recentPosts: f.recentPosts.map((p, i) => i === index ? { ...p, url: e.target.value } : p) }))} />
                  <Input aria-label={`게시물 ${index + 1} 이미지 주소`} placeholder="이미지 https://..." value={post.thumbnailUrl} onChange={(e) => setForm((f) => ({ ...f, recentPosts: f.recentPosts.map((p, i) => i === index ? { ...p, thumbnailUrl: e.target.value } : p) }))} />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">추가 플랫폼 지표</p>
              <p className="text-xs text-muted-foreground">직접 확인한 수치를 입력합니다. 입력하지 않은 플랫폼은 표시하지 않습니다.</p>
              {(["instagram", "tiktok", "youtube"] as const).filter((platform) => platform !== form.platform).map((platform) => {
                const metric = form.extraMetrics.find((m) => m.platform === platform);
                const change = (field: "followers" | "engagementRate" | "avgViews", value: string) => setForm((f) => ({ ...f, extraMetrics: [...f.extraMetrics.filter((m) => m.platform !== platform), { platform, followers: field === "followers" ? Number(value) : metric?.followers ?? 0, engagementRate: field === "engagementRate" ? Number(value) : metric?.engagementRate ?? 0, avgViews: field === "avgViews" ? (value ? Number(value) : null) : metric?.avgViews ?? null }] }));
                return <div key={platform} className="space-y-1"><Label>{platform === "youtube" ? "YouTube" : PLATFORM_LABEL[platform]}</Label><div className="grid grid-cols-3 gap-2"><Input type="number" min={0} placeholder="팔로워" aria-label={`${platform} 팔로워`} value={metric?.followers ?? ""} onChange={(e) => change("followers", e.target.value)} /><Input type="number" min={0} step="0.1" placeholder="참여율 %" aria-label={`${platform} 참여율`} value={metric?.engagementRate ?? ""} onChange={(e) => change("engagementRate", e.target.value)} /><Input type="number" min={0} placeholder="평균 조회" aria-label={`${platform} 평균 조회`} value={metric?.avgViews ?? ""} onChange={(e) => change("avgViews", e.target.value)} /></div></div>;
              })}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button type="submit">저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
