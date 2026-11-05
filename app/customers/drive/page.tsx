import { Suspense } from "react";
import { CustomerDrivePanel } from "@/components/customers/customer-drive-panel";

export default function CustomerDrivePage() {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Google Drive를 불러오는 중…</p>}><CustomerDrivePanel /></Suspense>;
}
