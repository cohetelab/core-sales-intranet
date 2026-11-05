"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Influencer } from "@/lib/influencer-data";

export function InfluencerAvatar({
  influencer,
  className,
}: {
  influencer: Pick<Influencer, "handle" | "profileImageUrl">;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {influencer.profileImageUrl && (
        <AvatarImage src={influencer.profileImageUrl} alt={`${influencer.handle} 프로필 사진`} />
      )}
      <AvatarFallback>{influencer.handle.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
