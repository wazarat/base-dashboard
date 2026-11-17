"use client";

import { unstable_createAdapterProvider as createAdapterProvider } from "nuqs/adapters/custom";
import { AtlasShell } from "./atlas-shell";

const NO_PARAMS = new URLSearchParams();

/** URL state for a render that cannot know the query string. Every key reads its default and writes go nowhere. */
const DefaultUrlState = createAdapterProvider(() => ({
  searchParams: NO_PARAMS,
  updateUrl() {},
  getSearchParamsSnapshot: () => new URLSearchParams(),
}));

/**
 * The page as it looks with no query string (no filters, 30d range, nothing open).
 *
 * The live shell reads the query string, which a static export cannot know, so Next
 * leaves it to the browser and writes the Suspense fallback into the HTML instead.
 * This is that fallback. It puts the real default view in the export for the first
 * paint and for readers that never run JavaScript; React swaps it for the live shell
 * as soon as it hydrates. Nothing below it may call useSearchParams, or the fallback
 * bails out of prerendering too and the build fails.
 */
export function PrerenderedShell({ children }: { children: React.ReactNode }) {
  return (
    <DefaultUrlState>
      <div data-prerender="" className="contents">
        <AtlasShell prerendered>{children}</AtlasShell>
      </div>
    </DefaultUrlState>
  );
}
