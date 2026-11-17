import { afterEach, describe, expect, it } from "vitest";
import { hasTime } from "../scripts/fetch/context";
import { candleWeekVolume, idlePool, tokenWeekVolume } from "../scripts/fetch/geckoterminal";
import { idleVenue } from "../scripts/fetch/geckoterminal-venues";
import { createClient, resetSharedLimiters } from "../scripts/fetch/http";
import type { GeckoVenueRecord } from "@/lib/history-types";

const ok = () => Promise.resolve(new Response("{}", { status: 200 }));

describe("shared rate limiter", () => {
  afterEach(() => resetSharedLimiters());

  it("spaces calls across clients with the same key, not per client", async () => {
    let t = 0;
    const starts: number[] = [];
    const opts = { minIntervalMs: 1000, rateKey: "gt", nowImpl: () => t, sleepImpl: async (ms: number) => void (t += ms), fetchImpl: (() => (starts.push(t), ok())) as unknown as typeof fetch };
    const a = createClient({ name: "a", ...opts });
    const b = createClient({ name: "b", ...opts });
    await Promise.all([a.getJson("https://x/1", { noCache: true }), b.getJson("https://x/2", { noCache: true }), a.getJson("https://x/3", { noCache: true })]);
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it("holds every client of the key after a 429", async () => {
    let t = 0;
    const starts: number[] = [];
    let first = true;
    const fetchImpl = (() => {
      starts.push(t);
      if (first) {
        first = false;
        return Promise.resolve(new Response("", { status: 429, headers: { "retry-after": "30" } }));
      }
      return ok();
    }) as unknown as typeof fetch;
    const opts = { minIntervalMs: 0, rateKey: "gt", nowImpl: () => t, sleepImpl: async (ms: number) => void (t += ms), fetchImpl };
    const a = createClient({ name: "a", ...opts });
    const b = createClient({ name: "b", ...opts });
    await a.getJson("https://x/1", { noCache: true });
    await b.getJson("https://x/2", { noCache: true });
    // a: refused at 0, retried at 30 s; b waits for the pause, so it starts no earlier than 30 s.
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(30_000);
    expect(starts[2]).toBeGreaterThanOrEqual(30_000);
  });

  it("keeps clients without a key independent", async () => {
    let t = 0;
    const starts: number[] = [];
    const opts = { minIntervalMs: 1000, nowImpl: () => t, sleepImpl: async (ms: number) => void (t += ms), fetchImpl: (() => (starts.push(t), ok())) as unknown as typeof fetch };
    await Promise.all([createClient({ name: "a", ...opts }).getJson("https://x/1"), createClient({ name: "b", ...opts }).getJson("https://x/2")]);
    expect(starts).toEqual([0, 0]);
  });
});

describe("idle pools, tokens and venues", () => {
  const week = (vol: number) => Array.from({ length: 7 }, (_, i) => [`2026-11-0${i + 1}`, 1, 1, 1, 1, vol]);
  const tokenRows = (vol: number) => Array.from({ length: 7 }, (_, i) => [`2026-11-0${i + 1}`, 1, null, null, vol]);

  it("sums the last 7 readings only", () => {
    expect(candleWeekVolume([["2026-10-01", 1, 1, 1, 1, 500], ...week(0)])).toBe(0);
    expect(tokenWeekVolume([...tokenRows(0), ["2026-11-08", 1, null, null, 3]])).toBe(3);
  });

  it("skips a pool only with a full quiet week on both the pool and its token", () => {
    expect(idlePool(week(0), tokenRows(0))).toBe(true);
    expect(idlePool(week(0), tokenRows(5))).toBe(false);
    expect(idlePool(week(2), tokenRows(0))).toBe(false);
    expect(idlePool(week(0).slice(0, 3), tokenRows(0))).toBe(false);
  });

  it("treats a venue as idle after seven readings without volume", () => {
    const rec = (vols: number[]) => ({ id: "v", name: "v", volume: vols.map((v, i) => [`2026-11-0${i + 1}`, v]), liquidity: [], pools: {} }) as unknown as GeckoVenueRecord;
    expect(idleVenue(rec([0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(idleVenue(rec([0, 0, 0, 0, 0, 0, 9]))).toBe(false);
    expect(idleVenue(rec([0, 0]))).toBe(false);
    expect(idleVenue(undefined)).toBe(false);
  });

  it("stops optional work at the deadline", () => {
    expect(hasTime({}, 5)).toBe(true);
    expect(hasTime({ deadlineMs: 10 }, 5)).toBe(true);
    expect(hasTime({ deadlineMs: 10 }, 10)).toBe(false);
  });
});

describe("adaptive spacing after a 429", () => {
  afterEach(() => resetSharedLimiters());

  it("adds a second to the shared spacing for every refusal", async () => {
    let t = 0;
    const starts: number[] = [];
    let refuse = 1;
    const fetchImpl = (() => {
      starts.push(t);
      if (refuse-- > 0) return Promise.resolve(new Response("", { status: 429, headers: { "retry-after": "5" } }));
      return ok();
    }) as unknown as typeof fetch;
    const c = createClient({ name: "a", rateKey: "slow", minIntervalMs: 2000, nowImpl: () => t, sleepImpl: async (ms: number) => void (t += ms), fetchImpl });
    await c.getJson("https://x/1", { noCache: true });
    await c.getJson("https://x/2", { noCache: true });
    // First call refused at 0 and retried at 5 s; the next call waits 2 s + 1 s extra after the last start (0).
    expect(starts).toEqual([0, 5000, 5000]);
    await c.getJson("https://x/3", { noCache: true });
    expect(starts[3] - starts[2]).toBe(3000);
  });
});
