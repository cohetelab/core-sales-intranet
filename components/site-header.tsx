"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { BellIcon, SlidersHorizontalIcon } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AgentDockToggle } from "@/components/agent-dock";
import { CommandPaletteTrigger } from "@/components/command-palette";
import { ViewModeToggle } from "@/components/view-mode";
import { useWorkspaceConfig } from "@/components/workspace-config";
import { pageTitle } from "@/lib/page-meta";

export function SiteHeader() {
  const pathname = usePathname();
  const { openSettings } = useWorkspaceConfig();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex h-full w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
        />
        <h1 className="text-base font-medium leading-none">
          {pageTitle(pathname)}
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <ViewModeToggle />
          <Button variant="ghost" size="icon" aria-label="화면 설정" title="화면 설정(메뉴·홈 카드 보이기/숨기기)" onClick={() => openSettings(pathname === "/" ? "home" : "menu")}>
            <SlidersHorizontalIcon className="size-4" />
          </Button>
          <CommandPaletteTrigger />
          <AgentDockToggle />
          <Button variant="ghost" size="icon" className="relative ml-auto">
            <BellIcon className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
