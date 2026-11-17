"use client";

import { TierInfoContent } from "@/components/atlas/tier-info";
import { ExternalLink } from "lucide-react";
import { Clamp } from "@/components/atlas/clamp";
import { chainText, tierText } from "@/components/atlas/plain-label";
import { Checkbox } from "@/components/ui/checkbox";
import { displayToken } from "@/lib/backer-filters";
import { displayUrl, fmtCompact, fmtInt, fmtPct, fmtUsd, fmtUsdFull, xUrl } from "@/lib/format";
import { RED_FLAG_LABEL, redFlagTypes } from "@/lib/red-flags";
import type { Project } from "@/lib/types";
import { projectColumnHelper as h, type ProjectColumnDef } from "./data-table";

const num = (v: number | null) => v ?? undefined;

/** Blank metrics are coverage gaps, so the cell says so in a word. */
function NotTracked() {
  return <span className="text-ink-300">Not tracked</span>;
}

function None() {
  return <span className="text-ink-300">none</span>;
}

function Usd({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <NotTracked />;
  return <span title={fmtUsdFull(v)}>{fmtUsd(v)}</span>;
}

function Text({ v, lines = 3, className }: { v: string | undefined; lines?: 2 | 3; className?: string }) {
  if (!v) return <None />;
  return (
    <Clamp lines={lines} className={className}>
      {v}
    </Clamp>
  );
}

function NameCell({ p, onOpen }: { p: Project; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(p.id);
      }}
      className="text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
    >
      {p.name}
    </button>
  );
}

const right = { meta: { align: "right" } };

export function nameColumn(onOpen: (id: string) => void): ProjectColumnDef {
  return h.accessor("name", {
    header: "Project",
    cell: ({ row }) => <NameCell p={row.original} onOpen={onOpen} />,
    sortFn: "alphanumeric",
  });
}

export const sectorColumn = h.accessor("sector", { header: "Sector", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span> });
export const subcategoryColumn = h.accessor((p) => p.subcategory ?? undefined, { id: "subcategory", header: "Subcategory", sortUndefined: "last" });
export const chainColumn = h.accessor("chain", { header: "Native chain", cell: ({ getValue }) => <span className="whitespace-nowrap text-ink-300">{chainText(getValue(), true)}</span> });
export const chainDetailColumn = h.accessor((p) => p.chainDetail ?? undefined, { id: "chainDetail", header: "Chain detail", sortUndefined: "last" });
export const tierColumn = h.accessor("tier", {
  header: "Tier",
  cell: ({ getValue }) => <span className="whitespace-nowrap text-ink-300">{tierText(getValue())}</span>,
  meta: { info: <TierInfoContent closing={null} /> },
});
export const statusColumn = h.accessor("status", { header: "Status", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span> });
export const tvlColumn = h.accessor((p) => num(p.tvl), { id: "tvl", header: "TVL", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", ...right });
export const volumeColumn = h.accessor((p) => num(p.volume), { id: "volume", header: "30d volume", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", ...right });
export const feesColumn = h.accessor((p) => num(p.fees), { id: "fees", header: "30d fees", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", ...right });
export const revenueColumn = h.accessor((p) => num(p.revenue), { id: "revenue", header: "30d revenue", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", ...right });
export const captureColumn = h.accessor((p) => num(p.revenueCapture), {
  id: "capture",
  header: "Revenue capture",
  cell: ({ getValue }) => {
    const v = getValue();
    return v === undefined ? <NotTracked /> : fmtPct(v);
  },
  sortUndefined: "last",
  ...right,
});
export const otherTractionColumn = h.accessor((p) => p.otherTraction ?? undefined, { id: "otherTraction", header: "Other traction signal", sortUndefined: "last", cell: ({ getValue }) => <Text v={getValue()} className="max-w-xs" /> });
export const fundingColumn = h.accessor("fundingType", { header: "Funding type", cell: ({ getValue }) => <span className={getValue() === "Not researched" ? "text-ink-300" : undefined}>{getValue()}</span> });
export const investorsColumn = h.accessor((p) => p.investors ?? undefined, { id: "investors", header: "Investors / backers", sortUndefined: "last", cell: ({ getValue }) => <Text v={getValue()} className="max-w-xs" /> });
export const amountColumn = h.accessor((p) => p.amountRaised ?? undefined, { id: "amountRaised", header: "Amount raised", sortUndefined: "last", cell: ({ getValue }) => getValue() ?? <None /> });
export const tokenColumn = h.accessor((p) => displayToken(p) ?? undefined, { id: "token", header: "Token", sortUndefined: "last", cell: ({ getValue }) => getValue() ?? <None /> });
/** Keyword flags from the research notes, never a rating. Hidden by default. */
export const securityColumn = h.accessor((p) => redFlagTypes(p).map((t) => RED_FLAG_LABEL[t]).join(", ") || undefined, {
  id: "securityFlags",
  header: "Security flags",
  sortUndefined: "last",
  cell: ({ getValue }) => <Text v={getValue()} lines={2} className="max-w-xs" />,
});
export const auditsColumn = h.accessor((p) => p.audits ?? undefined, { id: "audits", header: "Audits", sortUndefined: "last", cell: ({ getValue }) => <Text v={getValue()} className="max-w-xs" /> });
export const redFlagsColumn = h.accessor((p) => p.redFlags ?? undefined, { id: "redFlags", header: "Red flags", sortUndefined: "last", cell: ({ getValue }) => <Text v={getValue()} className="max-w-xs" /> });
export const viaColumn = h.accessor("discoveredVia", { header: "Discovered via", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span> });
export const descriptionColumn = h.accessor("description", { header: "Description", cell: ({ getValue }) => <Text v={getValue()} className="max-w-sm" /> });
export const websiteColumn = h.accessor((p) => p.website ?? undefined, {
  id: "website",
  header: "Website",
  sortUndefined: "last",
  cell: ({ getValue }) => {
    const v = getValue();
    return v ? (
      <a href={v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[12rem] items-center gap-1 underline-offset-2 hover:underline">
        <span className="truncate">{displayUrl(v)}</span> <ExternalLink className="size-3 shrink-0 text-ink-300" />
      </a>
    ) : (
      <None />
    );
  },
});
export const xColumn = h.accessor((p) => p.xHandle ?? undefined, {
  id: "x",
  header: "X",
  sortUndefined: "last",
  cell: ({ getValue }) => {
    const v = getValue();
    return v ? (
      <a href={xUrl(v)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline">
        {v} <ExternalLink className="size-3 text-ink-300" />
      </a>
    ) : (
      <None />
    );
  },
});

/** Onchain traction columns (src/lib/onchain.ts), optional and hidden by default. Never part of the chain KPIs. */
const ONCHAIN_SOURCE = "Stablecoin supply from DefiLlama, token volume on network robinhood from GeckoTerminal, holders from Blockscout. Kept apart from TVL and volume so nothing is counted twice.";
export const stableSupplyColumn = h.accessor((p) => p.onchain?.stableSupply ?? undefined, { id: "stableSupply", header: "Stablecoin supply", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", info: ONCHAIN_SOURCE } });
export const tokenVolumeColumn = h.accessor((p) => p.onchain?.tokenVolume30d ?? undefined, { id: "tokenVolume", header: "Token volume (30d)", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", info: ONCHAIN_SOURCE } });
export const holdersColumn = h.accessor((p) => p.onchain?.holders ?? p.onchain?.nftHolders ?? p.live?.holders ?? undefined, {
  id: "holders",
  header: "Holders",
  cell: ({ getValue }) => {
    const v = getValue();
    return v === undefined ? <NotTracked /> : <span title={fmtInt(v)}>{fmtCompact(v)}</span>;
  },
  sortUndefined: "last",
  meta: { align: "right", info: ONCHAIN_SOURCE },
});

export const feesDailyColumn = h.accessor((p) => p.live?.feesDaily ?? undefined, { id: "feesDaily", header: "Daily fees", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", hideBelow: "sm" } });
export const supplySideColumn = h.accessor((p) => p.live?.supplySideRevenue ?? undefined, { id: "supplySide", header: "30d supply-side rev.", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", hideBelow: "md" } });
export const holdersRevenueColumn = h.accessor((p) => p.live?.holdersRevenue ?? undefined, { id: "holdersRevenue", header: "30d holders rev.", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", hideBelow: "md" } });
export const annualisedColumn = h.accessor((p) => p.live?.annualisedRevenue ?? undefined, { id: "annualised", header: "Annualised rev.", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right" } });
export const marketCapColumn = h.accessor((p) => p.live?.tokenMarketCap ?? undefined, { id: "marketCap", header: "Token mcap", cell: ({ getValue }) => <Usd v={getValue()} />, sortUndefined: "last", meta: { align: "right", hideBelow: "sm" } });
export const psColumn = h.accessor((p) => p.live?.psRatio ?? undefined, {
  id: "ps",
  header: "P/S",
  cell: ({ getValue }) => (getValue() === undefined ? <span className="text-ink-300">no history</span> : <span title="Token market cap divided by annualised 30-day revenue">{(getValue() as number).toFixed(1)}×</span>),
  sortUndefined: "last",
  meta: { align: "right" },
});

/** Checkbox that adds the row to the compare tray; disabled when the tray is full. */
export function compareColumn(has: (id: string) => boolean, toggle: (id: string) => void, isFull: boolean): ProjectColumnDef {
  return h.display({
    id: "compare",
    header: () => <span className="sr-only">Compare</span>,
    cell: ({ row }) => {
      const checked = has(row.original.id);
      return (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex pr-3" title={!checked && isFull ? "Compare holds up to 4 projects" : checked ? "Remove from compare" : "Add to compare"}>
          <Checkbox checked={checked} disabled={!checked && isFull} onCheckedChange={() => toggle(row.original.id)} aria-label={`${checked ? "Remove" : "Add"} ${row.original.name} ${checked ? "from" : "to"} compare`} />
        </span>
      );
    },
  });
}
