import { Suspense } from "react";

import { SalesInvoicesPanel } from "@/components/sales-invoices/sales-invoices-panel";

export default function SalesInvoicesPage() {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중입니다.</p>}><SalesInvoicesPanel /></Suspense>;
}
