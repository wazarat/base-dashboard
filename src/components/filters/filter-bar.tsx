"use client";

import { Check, Link2, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { TierInfoTip } from "@/components/atlas/tier-info";
import { useGatedData } from "@/lib/use-gated";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHAIN_COLOR, TIER_COLOR } from "@/lib/colors";
import { meta, projects as allProjects } from "@/lib/data";
import { FACETS, applyFilters, facetValue, useFilters, type FacetKey } from "@/lib/filters";
import { tierLabel } from "@/lib/tier";
import { NATIVE_CHAINS, TIERS, type Tier } from "@/lib/types";
import { MultiSelect, type Option } from "./multi-select";

const FACET_HINTS: Partial<Record<string, string>> = {
  "Not researched": "This field was never checked for the project",
  "Not disclosed": "Checked, no funding disclosed",
};

function orderedValues(key: FacetKey): string[] {
  switch (key) {
    case "chain":
      return [...NATIVE_CHAINS];
    case "tier":
      return [...TIERS];
    case "sector":
      return meta.sectors;
    case "status":
      return meta.statuses;
    case "funding":
      return meta.fundingTypes;
    case "via":
      return meta.discoveredVia;
  }
}

function colorFor(key: FacetKey, value: string): string | undefined {
  if (key === "chain") return CHAIN_COLOR[value as keyof typeof CHAIN_COLOR];
  if (key === "tier") return TIER_COLOR[value as keyof typeof TIER_COLOR];
  return undefined;
}

/** Search and facets. There is no global chart control: metrics and time ranges live on the cards they drive. */
export function FilterBar() {
  const { state, setState, filtered, setFacet, reset, activeCount } = useFilters();
  // Funding types are gated data: the facet appears once a signed-in reader's data has arrived.
  const { ready, version } = useGatedData();
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Faceted counts: for each facet, count values among projects matching every other filter.
  const optionsByFacet = useMemo(() => {
    const out: Record<FacetKey, Option[]> = {} as Record<FacetKey, Option[]>;
    for (const { key } of FACETS) {
      const base = applyFilters(allProjects, { ...state, [key]: [] });
      const counts = new Map<string, number>();
      for (const p of base) for (const v of facetValue(p, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
      out[key] = orderedValues(key).map((v) => ({ value: v, label: key === "tier" ? tierLabel(v as Tier) : undefined, count: counts.get(v) ?? 0, color: colorFor(key, v), hint: FACET_HINTS[v] }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, version]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };


  const facetControls = (vertical: boolean) =>
    FACETS.filter(({ key }) => ready || key !== "funding").map(({ key, label }) => {
      const control = <MultiSelect key={key} label={label} options={optionsByFacet[key]} selected={state[key]} onChange={(vals) => setFacet(key, vals)} className={vertical ? "w-full" : undefined} />;
      if (key !== "tier") return control;
      // The tier filter carries the same tier explainer as the leaderboard header and the project modal.
      return (
        <span key={key} className={vertical ? "flex w-full items-center gap-1" : "inline-flex items-center gap-0.5"}>
          {control}
          <TierInfoTip />
        </span>
      );
    });

  return (
    <div className="sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/80 backdrop-blur-xl">
      <Container className="flex flex-wrap items-center gap-2 py-2 lg:items-start">
        <div className="relative min-w-40 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-300" />
          <Input
            type="search"
            value={state.q}
            onChange={(e) => void setState({ q: e.target.value })}
            placeholder="Search projects"
            title="Searches name, description and X handle"
            aria-label="Search projects"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">{facetControls(false)}</div>
        <div className="md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <SlidersHorizontal className="size-3.5" />
                Filters
                {activeCount > 0 && <span className="tabular text-ink-300">{activeCount}</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 px-4 pb-6">
                {facetControls(true)}
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={reset} disabled={activeCount === 0}>
                    Reset
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setSheetOpen(false)}>
                    Show {filtered.length}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <Button variant="ghost" size="icon" className="size-8" onClick={reset} disabled={activeCount === 0} aria-label="Reset filters">
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={copyLink} aria-label="Copy link to this view">
            {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          </Button>
        </div>
        {/* On wide screens the count sits at the right edge with Reset and Copy link under it (owner request, 2026-11-10). */}
        <div className="order-last flex w-full flex-col gap-1 lg:order-none lg:ml-auto lg:w-auto lg:items-end">
          <p className="text-xs text-ink-300 lg:leading-8" aria-live="polite">
            Showing <span className="tabular font-medium text-ink-50">{filtered.length}</span> of {allProjects.length} projects
          </p>
          <div className="hidden items-center gap-1.5 lg:flex">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={reset} disabled={activeCount === 0}>
              <RotateCcw className="size-3.5" /> Reset
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={copyLink}>
              {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
              {copied ? "Copied" : "Copy link to this view"}
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}
