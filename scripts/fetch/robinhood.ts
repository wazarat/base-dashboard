/**
 * Robinhood's official, free, read-only Stock Token API (docs.robinhood.com/chain/stock-token-apis).
 * Gives the authoritative list of stock tokens and their contract addresses on chain 4663.
 */
import fs from "node:fs";
import path from "node:path";
import { appendDated, readJson, writeJsonStable } from "../lib/store";
import { writeCsv } from "../lib/csv";
import { DATA, HISTORY } from "../lib/paths";
import { log } from "../lib/log";
import type { StockDaily, StockIndex, StockToken } from "../../src/lib/history-types";
import { createClient } from "./http";
import type { Ctx, RunResult } from "./context";

const BASE = "https://api.robinhood.com/rhj";

interface RhjAsset {
  tokenSymbol: string;
  tokenName: string;
  deployments: { contractAddress: string; chainId: number }[];
  currentMultiplier?: string;
  pendingMultiplier?: string;
  status?: string;
  logoUrl?: string;
  tradingCapabilities?: Record<string, { whole?: string; fractional?: string }>;
  tokenDecimals?: number;
  isin?: string;
}

export function parseAssets(json: { assets?: RhjAsset[] }): StockToken[] {
  const out: StockToken[] = [];
  for (const a of json.assets ?? []) {
    const dep = (a.deployments ?? []).find((d) => d.chainId === 4663);
    if (!dep || !a.tokenSymbol) continue;
    const caps: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(a.tradingCapabilities ?? {})) {
      caps[k] = v?.whole === "TRADING_STATUS_TRADABLE" || v?.fractional === "TRADING_STATUS_TRADABLE";
    }
    out.push({
      symbol: a.tokenSymbol,
      name: a.tokenName,
      address: dep.contractAddress.toLowerCase(),
      decimals: a.tokenDecimals ?? 18,
      status: a.status ?? "UNKNOWN",
      multiplier: Number(a.currentMultiplier ?? "1") || 1,
      pendingMultiplier: a.pendingMultiplier ? Number(a.pendingMultiplier) || null : null,
      isin: a.isin ?? null,
      logoUrl: a.logoUrl ?? null,
      tradingCapabilities: caps,
      feed: null,
      pools: [],
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export interface RhjQuote {
  tokenBid: number | null;
  tokenAsk: number | null;
  dailyTradingVolume: number | null;
  isTradingHalt: boolean;
}

export function parsePrices(json: { quotes?: Array<Record<string, unknown>> }): RhjQuote | null {
  const q = json.quotes?.[0];
  if (!q) return null;
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  return {
    tokenBid: num(q.tokenBid),
    tokenAsk: num(q.tokenAsk),
    dailyTradingVolume: num(q.dailyTradingVolume),
    isTradingHalt: Boolean(q.isTradingHalt),
  };
}

export function symbolFile(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9.-]+/g, "_");
}

export function indexPath(): string {
  return path.join(HISTORY, "stocks", "_index.json");
}
export function dailyPath(symbol: string): string {
  return path.join(HISTORY, "stocks", "daily", `${symbolFile(symbol)}.json`);
}
export function hourlyPath(symbol: string): string {
  return path.join(HISTORY, "stocks", "hourly", `${symbolFile(symbol)}.json`);
}

export function readIndex(): StockIndex {
  return readJson<StockIndex>(indexPath(), { fetchedAt: "", tokens: {} });
}

export function readDaily(symbol: string): StockDaily {
  return readJson<StockDaily>(dailyPath(symbol), { symbol, candles: {}, token: [], chainlink: [], robinhood: [], onchain: [], morpho: [] });
}

export function writeDaily(d: StockDaily): boolean {
  return writeJsonStable(dailyPath(d.symbol), d);
}

export const STOCK_TOKEN_COLUMNS = ["Ticker", "Name", "Token address", "Decimals", "Status", "Multiplier", "Chainlink feed proxy", "Feed 24/7", "Verified", "Source"];

export function stockTokensCsvRows(index: StockIndex) {
  return Object.values(index.tokens)
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((t) => ({
      Ticker: t.symbol,
      Name: t.name,
      "Token address": t.address,
      Decimals: t.decimals,
      Status: t.status,
      Multiplier: t.multiplier,
      "Chainlink feed proxy": t.feed?.proxy ?? "",
      "Feed 24/7": t.feed ? (t.feed.is247 ? "Yes" : "No") : "",
      Verified: t.status === "ASSET_STATUS_ACTIVE" ? "Yes" : "Listed, not active",
      Source: "Robinhood asset API (api.robinhood.com/rhj/assets)",
    }));
}

export function writeStockTokensCsv(index: StockIndex): boolean {
  return writeCsv(path.join(DATA, "stock-tokens.csv"), stockTokensCsvRows(index), STOCK_TOKEN_COLUMNS);
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "robinhood", minIntervalMs: 60 });
  const notes: string[] = [];
  const assets = await client.getJson<{ assets?: RhjAsset[] }>(`${BASE}/assets`);
  const tokens = parseAssets(assets);
  if (tokens.length < 50) throw new Error(`rhj/assets returned only ${tokens.length} tokens`);

  const prev = readIndex();
  const index: StockIndex = { fetchedAt: new Date(ctx.nowMs).toISOString(), tokens: {} };
  for (const t of tokens) {
    const old = prev.tokens[t.symbol];
    index.tokens[t.symbol] = { ...t, feed: old?.feed ?? null, pools: old?.pools ?? [] };
  }
  const dropped = Object.keys(prev.tokens).filter((s) => !index.tokens[s]);
  if (dropped.length) notes.push(`tokens no longer listed: ${dropped.join(", ")}`);

  let rows = 0;
  let failed = 0;
  for (const t of tokens) {
    try {
      const q = parsePrices(await client.getJson(`${BASE}/prices/${encodeURIComponent(t.symbol)}`, { noCache: true }));
      if (!q) continue;
      if (ctx.dryRun) continue;
      const daily = readDaily(t.symbol);
      daily.robinhood = appendDated(daily.robinhood, [ctx.today, q.tokenBid, q.tokenAsk, q.dailyTradingVolume]);
      writeDaily(daily);
      rows += 1;
    } catch (e) {
      failed += 1;
      log.debug(`rhj/prices/${t.symbol} failed: ${(e as Error).message}`);
    }
  }
  if (failed) notes.push(`${failed} price quotes failed`);
  if (!ctx.dryRun) {
    fs.mkdirSync(path.dirname(indexPath()), { recursive: true });
    writeJsonStable(indexPath(), index);
    writeStockTokensCsv(index);
  }
  notes.push(`${tokens.length} stock tokens listed`);
  return { rows: rows + tokens.length, calls: client.stats().calls, notes };
}
