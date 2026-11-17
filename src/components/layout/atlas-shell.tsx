"use client";

import { usePathname } from "next/navigation";
import { LoginDialog, PendingActionReplay } from "@/components/auth/login-dialog";
import { LoginWall } from "@/components/auth/login-wall";
import { GatedDataLoader } from "@/components/auth/gated-data";
import { FilterBar } from "@/components/filters/filter-bar";
import { ProjectModal } from "@/components/drawer/project-modal";
import { SectorModal } from "@/components/drawer/sector-modal";
import { FundingTypeModal } from "@/components/funding/funding-type-modal";
import { CompareTray } from "@/components/compare/compare-tray";
import { InvestorDrawer } from "@/components/investors/investor-drawer";
import { EventDialog } from "@/components/timeline/event-dialog";
import { useAccess } from "@/lib/access";
import { useGatedData } from "@/lib/use-gated";
import { useCompare } from "@/lib/compare";
import { cn } from "@/lib/utils";
import { AnalyticsEvents } from "./analytics-events";
import { Container } from "./container";

/** `prerendered` is the static fallback copy (prerendered-shell.tsx); it sends no analytics, so a view is counted once. */
export function AtlasShell({ children, prerendered = false }: { children: React.ReactNode; prerendered?: boolean }) {
  const { ids } = useCompare();
  const pathname = usePathname();
  const prose = pathname.startsWith("/methodology");
  // Modals that hold gated data (funding types, investors) only mount for readers who may see it.
  const { ready } = useGatedData();
  const full = useAccess().can({ action: "project-detail" }) && ready;
  return (
    <>
      {!prose && <FilterBar />}
      <main className={cn("flex-1", ids.length && "pb-20")}>
        <Container className="py-8">
          <LoginWall pathname={pathname}>{children}</LoginWall>
        </Container>
      </main>
      {!prose && <CompareTray />}
      {full && <InvestorDrawer />}
      <ProjectModal />
      <SectorModal />
      {full && <FundingTypeModal />}
      <EventDialog />
      <LoginDialog />
      <PendingActionReplay />
      <GatedDataLoader />
      {!prerendered && <AnalyticsEvents />}
    </>
  );
}
