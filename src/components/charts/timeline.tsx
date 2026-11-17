"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { EmptyState } from "@/components/atlas/chart-card";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { EVENT_COLOR, EVENT_ORDER } from "@/lib/colors";
import { fmtDate, fmtUsd } from "@/lib/format";
import { DAY_MS, markerSize, monthTicks, splitEarlier } from "@/lib/timeline";
import type { EcosystemEvent, EventType } from "@/lib/types";
import { cn } from "@/lib/utils";

const BEFORE = "Before 2025";
const monthTick = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

interface Point {
  t: number;
  lane: number;
  size: number;
  ev: EcosystemEvent | null;
  /** Set on the collapsed marker that stands for every event before the default start. */
  earlier?: EcosystemEvent[];
}

interface Props {
  events: EcosystemEvent[];
  /** ISO date. Events before it collapse into one marker until "Show earlier events" is pressed. */
  defaultStart: string;
  initialTypes?: EventType[];
  height?: number;
  /** Opens the detail popup for one event. */
  onOpen: (id: string) => void;
}

/**
 * The shared Atlas timeline (docs/ATLAS-UI.md, section 8): one lane per event
 * type, log-scaled marker area, plain toggle buttons with counts, and a
 * collapsed "Before 2025" marker so the default view is not mostly empty.
 * The card opens on its table view; this chart is the second view.
 */
export function Timeline({ events, defaultStart, initialTypes, height = 300, onOpen }: Props) {
  const [on, setOn] = useState<Set<EventType>>(() => new Set(initialTypes ?? EVENT_ORDER));
  const [showEarlier, setShowEarlier] = useState(false);
  const { earlier } = useMemo(() => splitEarlier(events, defaultStart), [events, defaultStart]);
  const collapsed = !showEarlier && earlier.length > 0;
  const lanes = useMemo(() => (collapsed ? [BEFORE, ...EVENT_ORDER] : [...EVENT_ORDER]), [collapsed]);
  const startMs = Date.parse(`${defaultStart}T00:00:00Z`);

  const { points, min, max, ticks } = useMemo(() => {
    const amounts = events.map((e) => e.amount ?? 0).filter((a) => a > 0);
    const lo = amounts.length ? Math.min(...amounts) : 0;
    const hi = amounts.length ? Math.max(...amounts) : 0;
    const offset = collapsed ? 1 : 0;
    const plotted = collapsed ? events.filter((e) => e.date >= defaultStart) : events;
    const pts: Point[] = plotted.map((e) => ({ t: Date.parse(`${e.date}T00:00:00Z`), lane: offset + EVENT_ORDER.indexOf(e.type), size: markerSize(e.amount, lo, hi), ev: e }));
    if (collapsed) pts.push({ t: startMs - 15 * DAY_MS, lane: 0, size: Math.min(420, 60 + earlier.length * 40), ev: null, earlier });
    const ts = pts.map((p) => p.t);
    const min = (collapsed ? startMs : ts.length ? Math.min(...ts) : startMs) - 30 * DAY_MS;
    const max = (ts.length ? Math.max(...ts) : startMs) + 30 * DAY_MS;
    return { points: pts, min, max, ticks: monthTicks(min, max) };
  }, [events, collapsed, defaultStart, startMs, earlier]);

  const visible = points.filter((p) => p.ev === null || on.has(p.ev.type));
  const toggle = (type: EventType) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label="Event types">
        {EVENT_ORDER.map((type) => {
          const count = events.filter((e) => e.type === type).length;
          const active = on.has(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(type)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60",
                active ? "text-ink-50" : "text-ink-300 hover:text-ink-50",
              )}
              aria-label={`${active ? "Hide" : "Show"} ${type} events`}
            >
              <span aria-hidden="true" className={cn("inline-block size-2 rounded-full", !active && "opacity-30")} style={{ backgroundColor: EVENT_COLOR[type] }} />
              {type} <span className="tabular text-ink-300">{count}</span>
            </button>
          );
        })}
        {earlier.length > 0 && (
          <button
            type="button"
            aria-pressed={showEarlier}
            onClick={() => setShowEarlier((v) => !v)}
            className="ml-auto inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-ink-300 underline-offset-2 transition-colors hover:text-ink-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
          >
            {showEarlier ? "Hide earlier events" : `Show earlier events (${earlier.length})`}
          </button>
        )}
      </div>
      {events.length === 0 ? (
        <EmptyState message="No events to show." />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis type="number" dataKey="t" domain={[min, max]} ticks={ticks} tickFormatter={monthTick} tickLine={false} axisLine={false} fontSize={10} />
              <YAxis type="number" dataKey="lane" domain={[-0.6, lanes.length - 0.4]} ticks={lanes.map((_, i) => i)} tickFormatter={(i) => lanes[i] ?? ""} width={92} tickLine={false} axisLine={false} reversed />
              <ZAxis type="number" dataKey="size" domain={[30, 420]} range={[30, 420]} />
              <Tooltip cursor={false} content={<EventTip />} />
              {collapsed && (
                <Scatter
                  name={BEFORE}
                  data={visible.filter((p) => p.ev === null)}
                  fill="var(--ink-400)"
                  fillOpacity={0.9}
                  stroke="var(--ink-900)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onClick={() => setShowEarlier(true)}
                  style={{ cursor: "pointer" }}
                />
              )}
              {EVENT_ORDER.map((type) => (
                <Scatter
                  key={type}
                  name={type}
                  data={visible.filter((p) => p.ev?.type === type)}
                  fill={EVENT_COLOR[type]}
                  fillOpacity={0.85}
                  stroke="var(--ink-900)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onClick={(d) => {
                    const ev = (d as unknown as { payload?: Point })?.payload?.ev ?? (d as unknown as Point).ev;
                    if (ev) onOpen(ev.id);
                  }}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-xs text-ink-300">
        Marker area grows with the recorded USD amount on a log scale; events without an amount use the smallest marker. Click a marker for its amount, detail and source.
      </p>
    </div>
  );
}

function EventTip({ active, payload }: TipProps<Point>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.ev === null) {
    const list = p.earlier ?? [];
    return (
      <TooltipFrame title={`${BEFORE}, ${list.length} ${list.length === 1 ? "event" : "events"}`}>
        {list.map((e) => (
          <div key={e.id} className="text-ink-300">
            {fmtDate(e.date)} · {e.title}
          </div>
        ))}
        <div className="pt-1 text-ink-300">Click to show them on the timeline</div>
      </TooltipFrame>
    );
  }
  const { ev } = p;
  return (
    <TooltipFrame title={ev.title}>
      <TooltipRow label={ev.type} color={EVENT_COLOR[ev.type]} value={fmtDate(ev.date)} />
      {ev.amount !== null && <TooltipRow label={ev.amountNote ?? "Amount"} value={fmtUsd(ev.amount)} />}
      {ev.amount === null && ev.amountNote && <TooltipRow label="Amount" value={ev.amountNote} />}
      {ev.projects.length > 0 && <div className="text-ink-300">{ev.projects.join(", ")}</div>}
      {ev.detail && <p className="pt-1 leading-snug">{ev.detail}</p>}
      <div className="pt-1 text-ink-300">Click for the detail and source</div>
    </TooltipFrame>
  );
}
