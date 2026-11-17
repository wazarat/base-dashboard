/**
 * The one traction rule (owner prompt, 2026-11-09). A project has traction when any of these hold:
 * a DefiLlama metric, $1M or more of stablecoin or RWA supply on the chain, $100K or more of
 * project-token DEX volume on the chain in 30 days, a verified NFT collection with 1,000 or more
 * holders and 100 or more transfers in 30 days, or a traction signal with a direct source.
 */
import { isDirectSource } from "./sources";
import type { Project } from "./types";

export const TRACTION_RULES = { supply: 1_000_000, tokenVolume: 100_000, nftHolders: 1_000, nftTransfers: 100 } as const;

export const TRACTION_REASONS = ["defillama", "stablecoin", "rwa", "token-volume", "nft", "signal"] as const;
export type TractionReason = (typeof TRACTION_REASONS)[number];

export const REASON_LABEL: Record<TractionReason, string> = {
  defillama: "DefiLlama metric",
  stablecoin: "Stablecoin supply",
  rwa: "RWA supply",
  "token-volume": "Token volume",
  nft: "NFT collection",
  signal: "Sourced signal",
};

/** One line per source, for InfoTips (generated from TRACTION_RULES, never typed twice). */
export const TRACTION_SOURCE_LINES: string[] = [
  "Any DefiLlama metric (TVL, volume, fees or revenue)",
  `Stablecoin or RWA supply on the chain of $${TRACTION_RULES.supply / 1_000_000}M or more`,
  `Project token DEX volume on the chain of $${TRACTION_RULES.tokenVolume / 1_000}K or more in 30 days`,
  `An NFT collection with ${TRACTION_RULES.nftHolders.toLocaleString("en-US")}+ holders and ${TRACTION_RULES.nftTransfers}+ transfers in 30 days`,
  "A traction signal with a direct source",
];

type TractionInput = Pick<Project, "hasTraction" | "otherTraction" | "tractionSources"> & { onchain?: Project["onchain"] };

export function tractionReasons(p: TractionInput): TractionReason[] {
  const out: TractionReason[] = [];
  const o = p.onchain ?? null;
  if (p.hasTraction) out.push("defillama");
  if (o?.stableSupply != null && o.stableSupply >= TRACTION_RULES.supply) out.push("stablecoin");
  if (o?.rwaSupply != null && o.rwaSupply >= TRACTION_RULES.supply) out.push("rwa");
  if (o?.tokenVolume30d != null && o.tokenVolume30d >= TRACTION_RULES.tokenVolume) out.push("token-volume");
  if (o?.nftHolders != null && o.nftHolders >= TRACTION_RULES.nftHolders && (o.nftTransfers30d ?? 0) >= TRACTION_RULES.nftTransfers) out.push("nft");
  if (p.otherTraction && p.tractionSources.some((u) => isDirectSource(u))) out.push("signal");
  return out;
}

/** The rule before 2026-11-09, kept only for the audit report (scripts/traction-audit.ts). */
export function legacyLive(p: TractionInput): boolean {
  return p.hasTraction || (Boolean(p.otherTraction) && p.tractionSources.some((u) => isDirectSource(u)));
}
