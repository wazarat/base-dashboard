"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartTable, ChartTableToggle, type ChartTableSpec, type ChartView } from "./chart-table";
import { FilteredNote } from "./filtered-note";
import { hasTakeaway, TakeawayList, type Takeaway } from "./takeaway-list";

/** Whether a card follows the project filters, shows the whole chain, or sits outside that question (compare, stocks). */
export type ChartScope = "filtered" | "chain" | "none";

/** What a chart learns about where it is drawn. `height` is 0 inside the card, meaning "use your default". */
export interface ChartViewCtx {
  expanded: boolean;
  height: number;
}

export type ChartChildren = ReactNode | ((ctx: ChartViewCtx) => ReactNode);

export function renderChart(children: ChartChildren, ctx: ChartViewCtx): ReactNode {
  return typeof children === "function" ? children(ctx) : children;
}

interface Props {
  title: string;
  takeaway?: Takeaway;
  info: ReactNode;
  scope: ChartScope;
  actions?: ReactNode;
  rangeControl?: ReactNode;
  scaleControl?: ReactNode;
  footer?: ReactNode;
  adminNote?: ReactNode;
  table?: ChartTableSpec;
  /** The view the card was showing when it was expanded. */
  initialView?: ChartView;
  children: ChartChildren;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full-screen view of one chart card: the same chart larger, its table, its source and (where the chart supports it) a range brush. */
export function ChartExpandDialog({ title, takeaway, info, scope, actions, rangeControl, scaleControl, footer, adminNote, table, initialView = "chart", children, open, onOpenChange }: Props) {
  const [view, setView] = useState<ChartView>(table ? initialView : "chart");
  const [height, setHeight] = useState(420);

  useEffect(() => {
    const measure = () => setHeight(Math.max(320, Math.min(640, Math.round(window.innerHeight * 0.55))));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="chart-expand"
        className="flex h-dvh w-screen max-w-none flex-col gap-4 overflow-y-auto rounded-none p-4 sm:h-[90dvh] sm:w-[min(1200px,calc(100vw-2rem))] sm:max-w-none sm:rounded-2xl sm:p-6"
      >
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="type-title text-ink-50">{title}</DialogTitle>
          {scope !== "none" && <FilteredNote scope={scope} className="block" />}
          <DialogDescription className="sr-only">{`${title}, full view`}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {rangeControl}
          {view === "chart" && scaleControl}
          {table && <ChartTableToggle view={view} onChange={setView} />}
        </div>
        {/* With a summary below, the whole view scrolls so the charts keep their full height. */}
        <div className={hasTakeaway(takeaway) ? "shrink-0" : "min-h-0 flex-1 overflow-auto"}>
          {table && view === "table" ? <ChartTable spec={{ ...table, maxRows: table.maxRows ?? 400 }} className="max-h-none" /> : renderChart(children, { expanded: true, height })}
        </div>
        {/* Takeaways sit at the bottom of the full view, under the chart (owner request, 2026-11-10). */}
        {hasTakeaway(takeaway) && <TakeawayList takeaway={takeaway} className="shrink-0 border-t border-ink-700/40 pt-3" />}
        <div className="space-y-1 border-t border-ink-700/40 pt-3 text-xs text-ink-300">
          <div>
            <span className="font-medium text-ink-50">Source.</span> {typeof info === "string" ? info : <div className="mt-1">{info}</div>}
          </div>
          {footer && <div>{footer}</div>}
          {adminNote && <div data-admin-note="">{adminNote}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
