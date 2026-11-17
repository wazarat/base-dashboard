"use client";

import { Maximize2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import type { Scale } from "@/lib/filters";
import { SHOW_NOTES } from "@/lib/notes";
import type { Range } from "@/lib/ranges";
import { useExpand } from "@/lib/use-expand";
import { cn } from "@/lib/utils";
import { ChartExpandDialog, renderChart, type ChartChildren, type ChartScope, type ChartViewCtx } from "./chart-expand";
import { ChartTable, ChartTableToggle, type ChartTableSpec, type ChartView } from "./chart-table";
import { FilteredNote } from "./filtered-note";
import { InfoTip } from "./info-tip";
import { RangeControl } from "./range-control";
import { Segmented } from "./segmented";
import type { Takeaway } from "./takeaway-list";

export type { ChartChildren, ChartScope, ChartViewCtx, Takeaway };

interface ChartCardProps {
  /** Stable kebab-case id, unique per page; also the value of ?expand= when the card is open full screen. */
  id: string;
  title: string;
  /** Summary shown only at the bottom of the expanded view, so cards stay uncluttered (owner request, 2026-11-10). Only text generated from the data belongs here; a hand-written line goes in `adminNote`. */
  takeaway?: Takeaway;
  /** Explains the metric and the source. */
  info: ReactNode;
  scope: ChartScope;
  /** The chart, or a render function that receives whether it is expanded and the height to fill. */
  children: ChartChildren;
  className?: string;
  actions?: ReactNode;
  /** This card's own time range (see src/lib/chart-range.ts). The control shows in both views and in the expanded dialog. */
  range?: Range;
  onRangeChange?: (r: Range) => void;
  rangeOptions?: readonly Range[];
  scale?: Scale;
  onScaleChange?: (s: Scale) => void;
  footer?: ReactNode;
  /** Research notes and hand-written lines. Shown under the chart only on a build with notes switched on (src/lib/notes.ts). */
  adminNote?: ReactNode;
  /** When given, a Chart / Table toggle lets readers see the plotted rows. */
  table?: ChartTableSpec;
  /** Which view the card opens in. Table-first suits a list of dated records (the timeline). */
  defaultView?: ChartView;
  expandable?: boolean;
}

export function ChartCard({ id, title, takeaway, info, scope, children, className, actions, range, onRangeChange, rangeOptions, scale, onScaleChange, footer, adminNote, table, defaultView = "chart", expandable = true }: ChartCardProps) {
  const note = SHOW_NOTES && adminNote ? adminNote : null;
  const [view, setView] = useState<ChartView>(table ? defaultView : "chart");
  const { open, setOpen } = useExpand(id);
  const rangeControl = range && onRangeChange ? <RangeControl label={`${title} date range`} value={range} onChange={onRangeChange} options={rangeOptions} /> : null;
  const scaleControl =
    scale && onScaleChange ? (
      <Segmented
        size="sm"
        ariaLabel="Axis scale"
        value={scale}
        onChange={onScaleChange}
        options={[
          { value: "log", label: "Log" },
          { value: "linear", label: "Linear" },
        ]}
      />
    ) : null;
  return (
    <>
      <Card id={id} className={className}>
        <CardSection className="space-y-3">
          {/* The title keeps its natural width; a row of controls too wide to sit beside it wraps underneath instead of squeezing it. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="max-w-full min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="type-card-title text-ink-50">{title}</h3>
                <InfoTip label={`About ${title}`}>{info}</InfoTip>
              </div>
              {scope !== "none" && <FilteredNote scope={scope} className="block" />}
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">
              {actions}
              {rangeControl}
              {view === "chart" && scaleControl}
              {table && <ChartTableToggle view={view} onChange={setView} />}
              {expandable && (
                <Button variant="ghost" size="icon-sm" className="text-ink-300 hover:text-ink-50" aria-label={`Expand ${title}`} onClick={() => setOpen(true)}>
                  <Maximize2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div>{table && view === "table" ? <ChartTable spec={table} /> : renderChart(children, { expanded: false, height: 0 })}</div>
        </CardSection>
        {footer && <CardSection className="py-3 text-xs text-ink-300">{footer}</CardSection>}
        {note && (
          <CardSection data-admin-note="" className="space-y-1 py-3 text-xs text-ink-300">
            {note}
          </CardSection>
        )}
      </Card>
      {expandable && open && (
        <ChartExpandDialog title={title} takeaway={takeaway} info={info} scope={scope} actions={actions} rangeControl={rangeControl} scaleControl={scaleControl} footer={footer} adminNote={note} table={table} initialView={view} open={open} onOpenChange={setOpen}>
          {children}
        </ChartExpandDialog>
      )}
    </>
  );
}

export function EmptyState({ message = "No projects match the current filters.", className }: { message?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex h-40 items-center justify-center rounded-lg border border-dashed border-ink-700/60 px-4 text-center text-sm text-ink-300", className)}>
      {message}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; shape?: "circle" | "square" | "hatch" }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300", className)} aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          {it.shape === "hatch" ? (
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-[2px] border border-ink-400/60"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--ink-muted) 0 1px, transparent 1px 3px)" }}
            />
          ) : (
            <span aria-hidden="true" className={cn("inline-block size-2.5", it.shape === "square" ? "rounded-[2px]" : "rounded-full")} style={{ backgroundColor: it.color }} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** A research note: pass it to a card's `adminNote`, never to `footer`. */
export function TvlNote() {
  return <span>Morpho and Steakhouse Financial largely report the same USDG vault capital, so summed TVL double counts roughly $0.5B.</span>;
}
