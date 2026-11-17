/**
 * Extra figures in DefiLlama responses the main fetcher already downloads (docs/SECTOR-METRICS.md, section 2).
 * Pure parsers, no requests of their own:
 * - the `<chain>-borrowed`, `-staking`, `-pool2` and `-vesting` series beside a protocol's TVL (/protocol/{slug})
 * - the 30-day revenue and methodology text of every listing in the revenue overview, which is how a
 *   revenue of zero by design (Morpho takes no fee) is told apart from a figure nobody tracks
 */
import { dateOf } from "../../src/lib/dates";
import { EXTRA_TVL_KEYS, type ExtraTvlKey, type LlamaMethodology, type Series } from "../../src/lib/history-types";

type TvlPoints = { date: number; totalLiquidityUSD: number }[];

function toSeries(pts: TvlPoints | undefined): Series {
  const m = new Map<string, number>();
  for (const p of pts ?? []) if (typeof p.totalLiquidityUSD === "number" && Number.isFinite(p.totalLiquidityUSD)) m.set(dateOf(p.date), Math.round(p.totalLiquidityUSD));
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The chain's borrowed, staking, pool2 and vesting series from one /protocol/{slug} response; keys the protocol does not report are left out. */
export function parseProtocolExtras(json: { chainTvls?: Record<string, { tvl?: TvlPoints }> }, chain: string): Partial<Record<ExtraTvlKey, Series>> {
  const out: Partial<Record<ExtraTvlKey, Series>> = {};
  for (const key of EXTRA_TVL_KEYS) {
    const s = toSeries(json.chainTvls?.[`${chain}-${key}`]?.tvl);
    if (s.length) out[key] = s;
  }
  return out;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Display name -> 30-day revenue and methodology text, from the revenue overview's protocol list. */
export function parseMethodology(json: { protocols?: Array<Record<string, unknown>> }): Record<string, LlamaMethodology> {
  const out: Record<string, LlamaMethodology> = {};
  for (const p of json.protocols ?? []) {
    const name = String(p.name ?? p.displayName ?? "");
    if (!name) continue;
    const m = (p.methodology ?? {}) as Record<string, unknown>;
    const total = p.total30d;
    out[name] = {
      revenue30d: typeof total === "number" && Number.isFinite(total) ? total : null,
      revenue: text(m.Revenue) ?? text(m.ProtocolRevenue),
      fees: text(m.Fees),
    };
  }
  return out;
}
