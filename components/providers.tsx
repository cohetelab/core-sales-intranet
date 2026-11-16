"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { AgentDockPanel, AgentDockProvider } from "@/components/agent-dock";
import { SampleDataNotice } from "@/components/sample-data-notice";
import { SheetLeadsProvider } from "@/components/sheet-leads-provider";
import { ViewModeGate, ViewModeProvider } from "@/components/view-mode";
import { WorkspaceConfigProvider } from "@/components/workspace-config";
import { CustomerStoreProvider } from "@/lib/customer-store";
import { InfluencerStoreProvider } from "@/lib/influencer-store";
import { InfluencerGroupStoreProvider } from "@/lib/influencer-group-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/share/")) return <>{children}</>;
  return (
    <CustomerStoreProvider>
      <InfluencerStoreProvider>
        <InfluencerGroupStoreProvider>
          <TooltipProvider delayDuration={0}>
            <SheetLeadsProvider>
            <ViewModeProvider>
            <ViewModeGate>
            <AgentDockProvider>
            <WorkspaceConfigProvider>
            <SidebarProvider
              style={
                {
                  // 아이콘 레일(4rem) + 소메뉴 패널(15rem)
                  "--sidebar-width": "calc(var(--spacing) * 76)",
                  "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
              }
            >
              <AppSidebar variant="inset" />
              <SidebarInset>
                <SiteHeader />
                <div className="flex flex-1 flex-col">
                  <div className="@container/main flex flex-1 flex-col gap-2">
                    <div
                      id="page-content"
                      className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6"
                    >
                      <SampleDataNotice />
                      {children}
                    </div>
                  </div>
                </div>
              </SidebarInset>
              <AgentDockPanel />
            </SidebarProvider>
            </WorkspaceConfigProvider>
            </AgentDockProvider>
            </ViewModeGate>
            </ViewModeProvider>
            </SheetLeadsProvider>
          </TooltipProvider>
        </InfluencerGroupStoreProvider>
      </InfluencerStoreProvider>
    </CustomerStoreProvider>
  );
}
