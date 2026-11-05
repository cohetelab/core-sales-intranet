import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/share-snapshots";

export const dynamic = "force-dynamic";

// 링크를 아는 사람만 보는 페이지라서 검색엔진 색인과 링크 따라가기를 막는다.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const snapshot = await getShare((await params).id);
  if (!snapshot) notFound();

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-4 py-10 text-[#171717] sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="rounded-3xl border border-black/10 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#6c63aa]">CORE SALES · CREATOR SHORTLIST</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{snapshot.campaignName}</h1>
          <p className="mt-3 text-sm text-neutral-600">{snapshot.brand} · 크리에이터 제안 리스트 · {new Date(snapshot.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
          {(snapshot.product || snapshot.goal || snapshot.message) && (
            <div className="mt-7 grid gap-3 border-t border-black/10 pt-6 text-sm sm:grid-cols-3">
              {snapshot.product && <div><p className="text-xs text-neutral-500">제품</p><p className="mt-1 font-medium">{snapshot.product}</p></div>}
              {snapshot.goal && <div><p className="text-xs text-neutral-500">목표</p><p className="mt-1 font-medium">{snapshot.goal}</p></div>}
              {snapshot.message && <div><p className="text-xs text-neutral-500">핵심 메시지</p><p className="mt-1 font-medium">{snapshot.message}</p></div>}
            </div>
          )}
        </header>

        <section>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">추천 크리에이터</h2>
            <span className="text-sm text-neutral-500">{snapshot.creators.length}명</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.creators.map((creator, index) => {
              const url = creator.platform === "instagram"
                ? `https://www.instagram.com/${encodeURIComponent(creator.handle)}/`
                : `https://www.tiktok.com/@${encodeURIComponent(creator.handle)}`;
              return (
                <article key={`${creator.platform}-${creator.handle}-${index}`} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-200 to-sky-200 font-bold text-violet-900">
                      {creator.profileImageUrl ? <Image src={creator.profileImageUrl} alt={`${creator.handle} 프로필`} fill sizes="80px" unoptimized className="object-cover" /> : creator.handle.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-500">{creator.platform === "instagram" ? "Instagram" : "TikTok"}</p>
                      <h3 className="mt-1 truncate text-lg font-semibold">@{creator.handle}</h3>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-violet-700 hover:underline">프로필 보기 ↗</a>
                    </div>
                  </div>
                  <p className="mt-4 line-clamp-3 min-h-10 text-sm leading-6 text-neutral-600">{creator.bio || "소개가 등록되지 않았습니다."}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">{creator.category.map((category) => <span key={category} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{category}</span>)}</div>
                  <div className="mt-5 grid grid-cols-3 gap-2 border-t border-black/10 pt-4 text-sm">
                    <div><p className="text-xs text-neutral-500">팔로워</p><p className="mt-1 font-semibold tabular-nums">{creator.followers.toLocaleString("ko-KR")}</p></div>
                    <div><p className="text-xs text-neutral-500">참여율</p><p className="mt-1 font-semibold tabular-nums">{creator.engagementRate.toFixed(1)}%</p></div>
                    <div><p className="text-xs text-neutral-500">평균 조회</p><p className="mt-1 font-semibold tabular-nums">{creator.avgViews?.toLocaleString("ko-KR") ?? "—"}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-5 text-xs text-neutral-500">표시된 수치는 리스트 발행 당시 등록된 값입니다. 실제 협업 조건은 별도 확인이 필요합니다.</p>
        </section>
      </div>
    </main>
  );
}
