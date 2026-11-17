/** Morpho's free GraphQL API; markets on chain 4663 where stock tokens are collateral. */
import path from "node:path";
import type { MorphoMarketRecord, MorphoTotalsRow } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { appendDated, readJson, writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { createClient } from "./http";
import { readDaily, readIndex, writeDaily } from "./robinhood";

export const MORPHO_URL = "https://api.morpho.org/graphql";
export const MARKETS_PAGE = 500;
/** One page of markets on chain 4663. The chain has more than one page of them, so the fetcher pages until a short page. */
export const marketsQuery = (skip = 0) => `{ markets(first: ${MARKETS_PAGE}, skip: ${skip}, where: { chainId_in: [4663] }) { items { marketId lltv loanAsset { symbol address } collateralAsset { symbol address } state { supplyAssetsUsd borrowAssetsUsd collateralAssetsUsd } } } }`;
export const MARKETS_QUERY = marketsQuery(0);

/** Lending supply, borrowed and collateral posted across every market, the three figures the lending pop-up shows side by side. */
export function morphoTotals(markets: MorphoMarket[]): { supplyUsd: number; borrowUsd: number; collateralUsd: number } {
  const sum = (k: "supplyUsd" | "borrowUsd" | "collateralUsd") => Math.round(markets.reduce((a, m) => a + (m[k] ?? 0), 0));
  return { supplyUsd: sum("supplyUsd"), borrowUsd: sum("borrowUsd"), collateralUsd: sum("collateralUsd") };
}

export interface MorphoMarket {
  marketId: string;
  lltv: number | null;
  loan: { symbol: string; address: string } | null;
  collateral: { symbol: string; address: string } | null;
  supplyUsd: number | null;
  borrowUsd: number | null;
  collateralUsd: number | null;
}

export function parseMarkets(json: { data?: { markets?: { items?: Array<Record<string, unknown>> } }; errors?: unknown[] }): MorphoMarket[] {
  if (json.errors?.length && !json.data) throw new Error(`Morpho GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const asset = (a: unknown) => {
    const o = a as { symbol?: string; address?: string } | null;
    return o?.address ? { symbol: o.symbol ?? "", address: o.address.toLowerCase() } : null;
  };
  return (json.data?.markets?.items ?? []).map((m) => {
    const state = (m.state as Record<string, unknown> | null) ?? null;
    return {
      marketId: String(m.marketId ?? m.uniqueKey ?? ""),
      lltv: m.lltv === undefined || m.lltv === null ? null : Number(m.lltv) / 1e18,
      loan: asset(m.loanAsset),
      collateral: asset(m.collateralAsset),
      supplyUsd: state ? num(state.supplyAssetsUsd) : null,
      borrowUsd: state ? num(state.borrowAssetsUsd) : null,
      collateralUsd: state ? num(state.collateralAssetsUsd) : null,
    };
  });
}

/** Collateral attaches to a stock token by address only; same-symbol other addresses are look-alikes. */
export function attachToStocks(markets: MorphoMarket[], stockByAddress: Map<string, string>, stockSymbols: Set<string>) {
  const perSymbol = new Map<string, { collateralUsd: number; borrowUsd: number }>();
  const flagged: MorphoMarket[] = [];
  for (const m of markets) {
    if (!m.collateral) continue;
    const sym = stockByAddress.get(m.collateral.address);
    if (sym) {
      const cur = perSymbol.get(sym) ?? { collateralUsd: 0, borrowUsd: 0 };
      cur.collateralUsd += m.collateralUsd ?? 0;
      cur.borrowUsd += m.borrowUsd ?? 0;
      perSymbol.set(sym, cur);
    } else if (stockSymbols.has(m.collateral.symbol.replace(/on$/, "").toUpperCase())) {
      flagged.push(m);
    }
  }
  return { perSymbol, lookAlikes: flagged };
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "morpho", minIntervalMs: 1000 });
  const markets: MorphoMarket[] = [];
  for (let page = 0; page < 10; page++) {
    const batch = parseMarkets(await client.postJson(MORPHO_URL, { query: marketsQuery(page * MARKETS_PAGE) }));
    markets.push(...batch);
    if (batch.length < MARKETS_PAGE) break;
  }
  const index = readIndex();
  const byAddr = new Map(Object.values(index.tokens).map((t) => [t.address, t.symbol]));
  const { perSymbol, lookAlikes } = attachToStocks(markets, byAddr, new Set(Object.keys(index.tokens)));
  const file = path.join(HISTORY, "morpho", "markets.json");
  const store = readJson<Record<string, MorphoMarketRecord>>(file, {});
  const lookAlikeIds = new Set(lookAlikes.map((m) => m.marketId));
  for (const m of markets) {
    const rec = store[m.marketId] ?? { marketId: m.marketId, lltv: m.lltv, loan: m.loan, collateral: m.collateral, lookAlike: false, series: [] };
    rec.lltv = m.lltv;
    rec.loan = m.loan;
    rec.collateral = m.collateral;
    rec.lookAlike = lookAlikeIds.has(m.marketId);
    rec.series = appendDated(rec.series, [ctx.today, m.supplyUsd, m.borrowUsd, m.collateralUsd]);
    store[m.marketId] = rec;
  }
  const totals = morphoTotals(markets);
  const totalsFile = path.join(HISTORY, "morpho", "totals.json");
  if (!ctx.dryRun) {
    writeJsonStable(totalsFile, appendDated(readJson<MorphoTotalsRow[]>(totalsFile, []), [ctx.today, totals.supplyUsd, totals.borrowUsd, totals.collateralUsd]));
    writeJsonStable(file, store);
    for (const [sym, v] of perSymbol) {
      const daily = readDaily(sym);
      daily.morpho = appendDated(daily.morpho, [ctx.today, Math.round(v.collateralUsd), Math.round(v.borrowUsd)]);
      writeDaily(daily);
    }
  }
  const notes = [`${markets.length} markets on 4663, ${perSymbol.size} stock tokens used as collateral, ${lookAlikes.length} look-alike collateral markets flagged`];
  return { rows: markets.length, calls: client.stats().calls, notes };
}
