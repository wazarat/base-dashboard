/**
 * One GeckoTerminal client setup for every GeckoTerminal source. The keyless API documents 30 calls a minute,
 * but CoinGecko's keyless page lists about 10 a minute for GeckoTerminal endpoints, and the daily runs saw
 * about 8.5 (342 calls in 40 minutes, most of it waiting out 429s at 2.5 s spacing). So calls are spaced
 * 6.5 s apart (about 9 a minute) on one limiter shared by all three sources, which can then run in parallel
 * lanes without adding up past the limit. GT_INTERVAL_MS overrides the spacing.
 */
import { createClient, type HttpClient } from "./http";

export const GECKO_RATE_KEY = "geckoterminal";
export const GECKO_INTERVAL_MS = 6500;

export function geckoClient(name: string, env: Record<string, string | undefined> = process.env): HttpClient {
  const interval = Number(env.GT_INTERVAL_MS ?? GECKO_INTERVAL_MS);
  return createClient({ name, rateKey: GECKO_RATE_KEY, minIntervalMs: Number.isFinite(interval) && interval >= 0 ? interval : GECKO_INTERVAL_MS, maxRetries: 4, minBackoffMs: 20_000, timeoutMs: 60_000 });
}
