import type { EventType, NativeChain, Tier } from "./types";

/**
 * Every colour is a CSS variable defined in globals.css for both light and dark,
 * so charts re-theme without re-rendering. Hex values were validated with the
 * dataviz palette checker (adjacent pairs for stacks, all pairs for scatter).
 */
export const CHAIN_COLOR: Record<NativeChain, string> = {
  "Base native": "var(--chain-base)",
  "Other EVM": "var(--chain-other-evm)",
  "Other non-EVM": "var(--chain-other-nonevm)",
  "Centralized / off-chain": "var(--chain-offchain)",
};

/** Secondary encoding for scatter plots (four series exceed the all-pairs colour cap). */
export const CHAIN_SHAPE: Record<NativeChain, "circle" | "square" | "triangle" | "diamond"> = {
  "Base native": "circle",
  "Other EVM": "square",
  "Other non-EVM": "triangle",
  "Centralized / off-chain": "diamond",
};

export const CHAIN_SHORT: Record<NativeChain, string> = {
  "Base native": "Base native",
  "Other EVM": "Other EVM",
  "Other non-EVM": "Non-EVM",
  "Centralized / off-chain": "Offchain",
};

export const TIER_COLOR: Record<Tier, string> = {
  "Tier 1 - Leader": "var(--tier-1)",
  "Tier 2 - Strong": "var(--tier-2)",
  "Tier 3 - Emerging": "var(--tier-3)",
  "Tracked, negligible": "var(--tier-none)",
  "Not tracked": "var(--tier-none)",
  "Not applicable": "var(--tier-none)",
};

export const TIER_SHORT: Record<Tier, string> = {
  "Tier 1 - Leader": "Tier 1",
  "Tier 2 - Strong": "Tier 2",
  "Tier 3 - Emerging": "Tier 3",
  "Tracked, negligible": "Negligible",
  "Not tracked": "TBD",
  "Not applicable": "Not applicable",
};

export const EVENT_COLOR: Record<EventType, string> = {
  Incident: "var(--event-incident)",
  Milestone: "var(--event-milestone)",
  Integration: "var(--event-integration)",
  Program: "var(--event-program)",
  Funding: "var(--event-funding)",
  Incentive: "var(--event-incentive)",
};

/** Lane order for the timeline; adjacent pairs validated in both modes. */
export const EVENT_ORDER: EventType[] = ["Incident", "Milestone", "Integration", "Program", "Funding", "Incentive"];

/** Fixed categorical order for disclosed funding types, one colour slot each. Rare types fold into "Other". */
export const FUNDING_ORDER = [
  "VC-backed",
  "Token-funded",
  "Token/DAO treasury",
  "Grant/Program",
  "Bootstrapped",
  "Corporate/parent",
  "Acquired",
  "Other",
] as const;

export function fundingColor(type: string): string {
  if (type === "Not researched") return "var(--cat-notresearched)";
  if (type === "Not disclosed") return "var(--cat-notdisclosed)";
  const i = (FUNDING_ORDER as readonly string[]).indexOf(type);
  return `var(--cat-${i === -1 ? FUNDING_ORDER.length : i + 1})`;
}

export function fundingBucket(type: string): string {
  if (type === "Not researched" || type === "Not disclosed") return type;
  return (FUNDING_ORDER as readonly string[]).includes(type) ? type : "Other";
}

export const SEQ = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

/** Sequential colour for a 0..1 share (used by the treemap for native share). */
export function seqColor(t: number | null): string {
  if (t === null || !Number.isFinite(t)) return "var(--tier-none)";
  const i = Math.min(SEQ.length - 1, Math.max(0, Math.floor(t * SEQ.length)));
  return SEQ[i];
}

export const CHART = {
  grid: "var(--grid)",
  axis: "var(--axis)",
  muted: "var(--ink-muted)",
  secondary: "var(--ink-secondary)",
  surface: "var(--surface-chart)",
  background: "var(--background)",
  foreground: "var(--foreground)",
};

/** Diverging ramp for premium (red arm) vs discount (blue arm); validated per mode as two ordinal arms. */
export const DIVERGING = {
  neg: ["var(--div-neg-1)", "var(--div-neg-2)", "var(--div-neg-3)"],
  mid: "var(--div-mid)",
  pos: ["var(--div-pos-1)", "var(--div-pos-2)", "var(--div-pos-3)"],
};

/** Thresholds for the three steps on each side: 0.25%, 1%, 3%. */
export const DIVERGING_STEPS = [0.0025, 0.01, 0.03];

export function divergingColor(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "transparent";
  const a = Math.abs(v);
  if (a < DIVERGING_STEPS[0]) return DIVERGING.mid;
  const i = a < DIVERGING_STEPS[1] ? 0 : a < DIVERGING_STEPS[2] ? 1 : 2;
  return v > 0 ? DIVERGING.pos[i] : DIVERGING.neg[i];
}

/** Fixed categorical slots for up to five named series; the sixth and beyond fold into a hatched "Other". */
export const CAT5 = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
export const HATCH_ID = "atlas-hatch";
export const HATCH_FILL = `url(#${HATCH_ID})`;

/** Human label for a GeckoTerminal dex id such as "uniswap-v3-robinhood". */
export function dexLabel(id: string): string {
  const base = id.replace(/-base$/, "").replace(/^base-/, "");
  return base
    .split("-")
    .map((w) => (/^v\d+$/.test(w) ? w : /^(clmm|dlmm|amm|cl)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
