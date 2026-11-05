import * as React from "react";

import type { SheetLeads } from "@/components/sheet-leads-provider";
import { SheetLoginCard } from "@/components/leads/sheet-login-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// 시트 연동 모드에서 데이터가 보이기 전의 화면(연결 확인·로그인·불러오는 중·오류). 보여줄 게 없으면(CSV 방식·연동 꺼짐·준비 완료) null.
export function renderSheetStatus(sheet: SheetLeads): React.ReactNode | null {
  if (sheet.csvMode) return null;
  if (sheet.status === "checking") {
    return <p className="py-10 text-center text-sm text-muted-foreground">연결을 확인하는 중…</p>;
  }
  if (sheet.status === "login") return <SheetLoginCard onLogin={sheet.login} onUseCsv={() => sheet.setCsvMode(true)} />;
  if (sheet.status === "loading") {
    return <p className="py-10 text-center text-sm text-muted-foreground">시트에서 리드를 불러오는 중…</p>;
  }
  if (sheet.status === "error") {
    return (
      <Card className="mx-auto w-full max-w-md shadow-xs">
        <CardContent className="space-y-3 text-center">
          <p className="text-sm font-medium">시트를 불러오지 못했습니다</p>
          <p role="alert" className="text-xs text-muted-foreground">{sheet.notice?.text ?? "잠시 뒤에 다시 시도해 주세요"}</p>
          <Button variant="outline" size="sm" onClick={() => void sheet.refresh()}>
            다시 시도
          </Button>
          <button type="button" onClick={() => sheet.setCsvMode(true)} className="block w-full text-center text-xs text-muted-foreground underline hover:text-foreground">
            구글 시트 연동 없이 CSV 파일로 가져오기
          </button>
        </CardContent>
      </Card>
    );
  }
  return null;
}
