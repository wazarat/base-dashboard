import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/auth/auth-controls";
import { SubmitProjectButton } from "@/components/forms/tally-buttons";
import { Container } from "./container";
import { MainNav, MainNavFallback } from "./main-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Header per docs/ATLAS-UI.md, section 3: the CanHav Research lockup (mark at the
 * height of both lines, "Base Ecosystem Atlas" with the Beta tag under the
 * name), the page tabs, then Submit a project and the theme toggle. Nothing
 * else. Below xl the tabs drop to a second row that scrolls sideways.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-ink-700/60 bg-ink-950/80 backdrop-blur-xl">
      <Container className="grid grid-cols-[1fr_auto] items-center gap-x-4 xl:grid-cols-[auto_1fr_auto]">
        <Link href="/" className="flex h-nav min-w-0 items-center gap-3" aria-label="CanHav Research, Base Ecosystem Atlas, beta, home">
          <Image src="/mark.svg" alt="" width={44} height={44} priority className="size-11 shrink-0 object-contain" />
          <span className="flex min-w-0 flex-col justify-center gap-0.5">
            <span className="whitespace-nowrap font-display text-base font-semibold leading-tight tracking-tight text-ink-50">CanHav Research</span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[13px] leading-tight text-ink-300">Base Ecosystem Atlas</span>
              <span className="rounded-full border border-electric-500/70 px-2 py-px text-[10px] font-semibold uppercase leading-3.5 tracking-[0.08em] text-electric-300">Beta</span>
            </span>
          </span>
        </Link>
        <div className="flex h-nav items-center justify-end gap-2 xl:col-start-3">
          <SubmitProjectButton variant="default" iconOnlyBelowSm />
          <AuthControls />
          <ThemeToggle />
        </div>
        <div className="col-span-2 -mx-5 min-w-0 border-t border-ink-700/60 px-5 sm:-mx-6 sm:px-6 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mx-0 xl:justify-self-center xl:border-t-0 xl:px-0">
          <Suspense fallback={<MainNavFallback />}>
            <MainNav />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}
