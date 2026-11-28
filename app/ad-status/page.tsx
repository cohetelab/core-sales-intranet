"use client";

import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// 광고 현황 대시보드 주소. 주소가 바뀌면 이 한 줄만 고치면 된다.
const AD_DASHBOARD_URL = "https://core-creators-prompt-vercel.vercel.app/";

export default function AdStatusPage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Meta 광고 소재 성과 대시보드입니다. 화면이 비어 있거나 로그인 창이 뜨지 않으면 오른쪽 버튼으로 새 창에서 열어 주세요.
        </p>
        <Button asChild variant="outline">
          <a href={AD_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            새 창에서 열기
          </a>
        </Button>
      </div>
      {/* 대시보드를 이 화면 안에 그대로 보여준다. 높이는 화면에서 위쪽 영역을 뺀 만큼 */}
      <iframe
        src={AD_DASHBOARD_URL}
        title="광고 현황 대시보드"
        className="h-[calc(100vh-11rem)] w-full rounded-xl border border-border bg-background"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
