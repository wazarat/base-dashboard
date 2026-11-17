"use client";

import { SlidersHorizontal } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useMemo } from "react";
import { Segmented } from "@/components/atlas/segmented";
import { MultiSelect } from "@/components/filters/multi-select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { investors, projects as allProjects } from "@/lib/data";
import { activeMoreCount, HAS_LABEL, HAS_METRICS, MIN_TVL_LABEL, MIN_TVLS, moreFilterParsers, NO_MORE_FILTERS, ONCHAIN_FILTER_LABEL, subcategoryOptions, type MinTvl, type MoreFilters } from "@/lib/explorer-filters";
import { useMedia } from "@/lib/use-media";

/** The Explorer's extra filters, each in the URL. Applies to the table and the map alike. */
export function useMoreFilters() {
  const [f, setF] = useQueryStates(moreFilterParsers, { history: "replace", clearOnDefault: true });
  const filters = f as MoreFilters;
  return { filters, setF, clear: () => void setF(NO_MORE_FILTERS), active: activeMoreCount(filters) };
}

const ANY = "any";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="type-label text-ink-300">{label}</div>
      {children}
    </div>
  );
}

function Fields({ sectors }: { sectors: string[] }) {
  const { filters: f, setF } = useMoreFilters();
  const subs = useMemo(() => subcategoryOptions(allProjects, sectors), [sectors]);
  const investorOptions = useMemo(() => investors.map((i) => ({ value: i.id, label: i.name, count: i.projects.filter((p) => p.projectId).length })), []);
  return (
    <div className="space-y-4">
      <Row label="Subcategory">
        <MultiSelect label="Subcategory" options={subs} selected={f.xsub} onChange={(v) => void setF({ xsub: v })} className="w-full" />
      </Row>
      <Row label="Minimum TVL">
        <Segmented
          ariaLabel="Minimum TVL"
          size="sm"
          value={f.xtvl ?? ANY}
          onChange={(v) => void setF({ xtvl: v === ANY ? null : (v as MinTvl) })}
          options={[{ value: ANY, label: "Any" }, ...MIN_TVLS.map((t) => ({ value: t, label: MIN_TVL_LABEL[t] }))]}
          className="flex-wrap"
        />
      </Row>
      <Row label="Tracked metrics">
        <MultiSelect label="Tracked metrics" options={HAS_METRICS.map((m) => ({ value: m, label: HAS_LABEL[m] }))} selected={f.xhas} onChange={(v) => void setF({ xhas: v })} searchable={false} className="w-full" />
      </Row>
      <Row label="Live token">
        <Segmented ariaLabel="Live token" size="sm" value={f.xtok ?? ANY} onChange={(v) => void setF({ xtok: v === ANY ? null : (v as "yes" | "no") })} options={[{ value: ANY, label: "Any" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
      </Row>
      <Row label="Token or supply data">
        <Segmented ariaLabel="Token or supply data" size="sm" value={f.xonc ?? ANY} onChange={(v) => void setF({ xonc: v === ANY ? null : "yes" })} options={[{ value: ANY, label: "Any" }, { value: "yes", label: ONCHAIN_FILTER_LABEL }]} className="flex-wrap" />
      </Row>
      <Row label="Disclosed funding">
        <Segmented ariaLabel="Disclosed funding" size="sm" value={f.xfund ?? ANY} onChange={(v) => void setF({ xfund: v === ANY ? null : (v as "yes" | "no") })} options={[{ value: ANY, label: "Any" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
      </Row>
      <Row label="Investor">
        {/* One investor at a time: picking another replaces the first. */}
        <MultiSelect label="Investor" options={investorOptions} selected={f.xinv ? [f.xinv] : []} onChange={(v) => void setF({ xinv: v.find((x) => x !== f.xinv) ?? null })} className="w-full" />
      </Row>
      <Row label="Base money">
        <Segmented ariaLabel="Base money" size="sm" value={f.xrh ?? ANY} onChange={(v) => void setF({ xrh: v === ANY ? null : "yes" })} options={[{ value: ANY, label: "Any" }, { value: "yes", label: "Has a Base related round" }]} className="flex-wrap" />
      </Row>
    </div>
  );
}

export function MoreFiltersButton({ sectors }: { sectors: string[] }) {
  const { active, clear } = useMoreFilters();
  const phone = useMedia("(max-width: 639px)"); // copy-ok
  const trigger = (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" data-testid="more-filters">
      <SlidersHorizontal className="size-3.5" />
      More filters
      {active > 0 && <span className="tabular text-ink-300">{active}</span>}
    </Button>
  );
  const footer = (
    <div className="flex justify-end pt-2">
      <Button variant="ghost" size="sm" className="text-xs" onClick={clear} disabled={active === 0}>
        Clear all
      </Button>
    </div>
  );
  if (phone)
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>More filters</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <Fields sectors={sectors} />
            {footer}
          </div>
        </SheetContent>
      </Sheet>
    );
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-96 max-w-[calc(100vw-2rem)] p-4">
        <Fields sectors={sectors} />
        {footer}
      </PopoverContent>
    </Popover>
  );
}
