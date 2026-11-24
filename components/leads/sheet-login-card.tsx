"use client";

import * as React from "react";
import { LockKeyholeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SALES_REPS } from "@/lib/sales-reps";

// 시트 연동 모드의 입구. 공용 비밀번호와 "나는 누구"를 고르면 들어간다(이름은 시트 수정 기록에 남는다).
export function SheetLoginCard({
  onLogin,
  onUseCsv,
}: {
  onLogin: (passcode: string, name: string) => Promise<string | null>;
  onUseCsv?: () => void;
}) {
  const [name, setName] = React.useState<string>(SALES_REPS[0]);
  const [passcode, setPasscode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  // 관리자 이름은 관리자 비밀번호가 따로 있을 수 있다(서버가 알려 준다)
  const [adminInfo, setAdminInfo] = React.useState<{ admins: string[]; protected: boolean }>({ admins: [], protected: false });
  React.useEffect(() => {
    fetch("/api/leads/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { admins?: string[]; adminProtected?: boolean }) => setAdminInfo({ admins: s.admins ?? [], protected: s.adminProtected === true }))
      .catch(() => undefined);
  }, []);
  const needsAdminPass = adminInfo.protected && adminInfo.admins.includes(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError("");
    const err = await onLogin(passcode, name);
    if (err) setError(err);
    setPasscode("");
    setBusy(false);
  }

  return (
    <Card className="mx-auto w-full max-w-sm shadow-xs">
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2">
            <LockKeyholeIcon className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">문의 시트 리드</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            고객 연락처가 들어 있어 비밀번호가 필요합니다. 배정과 수정 기록에 이름이 남으니 본인을 선택해 주세요.
          </p>
          <div className="space-y-1.5">
            <Label>나는</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger className="w-full" aria-label="내 이름">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALES_REPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="leads-passcode">{needsAdminPass ? "관리자 비밀번호" : "비밀번호"}</Label>
            <Input id="leads-passcode" type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} aria-label="리드 화면 비밀번호" />
          </div>
          {needsAdminPass && <p className="text-[11px] text-muted-foreground">관리자는 공용 비밀번호가 아니라 관리자 비밀번호로 들어갑니다.</p>}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!passcode || busy}>
            {busy ? "확인하는 중…" : "들어가기"}
          </Button>
          {onUseCsv && (
            <button type="button" onClick={onUseCsv} className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground">
              구글 시트 연동 없이 CSV 파일로 가져오기
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
