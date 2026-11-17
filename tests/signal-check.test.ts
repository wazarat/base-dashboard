import { describe, expect, it } from "vitest";
import { projects } from "@/lib/data";
import { checkSignal, parseSignalDate, parseSignalFigures, SIGNAL_GAP, SIGNAL_MAX_AGE_DAYS } from "@/lib/signal-check";

const SNAP = "2026-11-09";
const END = "2026-11-09";

describe("signal dates", () => {
  it("reads a date from the closing parenthesis, a month alone meaning its last day", () => {
    expect(parseSignalDate("$1.4B stock-token and spot-perp volume, $14.5M stock TVL (Sep 2026)")).toBe("2026-09-30");
    expect(parseSignalDate("About $369M USDe on the chain, 8.2K holders (Blockscout, Nov 9, 2026)")).toBe("2026-11-09");
    expect(parseSignalDate("syrupUSDG about $218M TVL (Jul 2026)")).toBe("2026-07-31");
    expect(parseSignalDate("$1B+ deposited into vaults in under three months")).toBeNull();
    // A date in the middle of the text is part of the claim, not its as-of day.
    expect(parseSignalDate("Listed in Sep 2026 on Kraken")).toBeNull();
  });

  it("falls back to the dataset snapshot day and says so", () => {
    expect(checkSignal("$1B+ deposited into vaults", SNAP, {}, END)).toMatchObject({ asOf: SNAP, dated: false });
    expect(checkSignal("About $218M TVL (Jul 2026)", SNAP, {}, END)).toMatchObject({ asOf: "2026-07-31", dated: true });
    expect(checkSignal(null, SNAP, {}, END)).toBeNull();
  });

  it("gives every signal in the dataset a date", () => {
    const withSignal = projects.filter((p) => p.otherTraction);
    expect(withSignal.length).toBeGreaterThan(20);
    for (const p of withSignal) expect(p.signal?.asOf, p.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const p of projects.filter((x) => !x.otherTraction)) expect(p.signal ?? null).toBeNull();
  });
});

describe("signal figures", () => {
  it("names the kind from the figure's own clause", () => {
    expect(parseSignalFigures("$1B+ deposited into vaults in under three months")).toMatchObject([{ kind: "deposited", usd: 1e9, atLeast: true }]);
    expect(parseSignalFigures("$1.4B stock-token and spot-perp volume, $14.5M stock TVL (Sep 2026)")).toMatchObject([{ kind: null, usd: 1.4e9 }, { kind: "tvl", usd: 14.5e6, atLeast: false }]);
    expect(parseSignalFigures("USDG supply on the chain about $641M, 446K holders (Blockscout, Nov 9, 2026)")).toMatchObject([{ kind: "supply", usd: 641e6 }]);
    expect(parseSignalFigures("Vault TVL past $100M after migration, $10M pre-IPO vault")[0]).toMatchObject({ kind: "tvl", usd: 100e6, atLeast: true });
  });

  it("never compares cumulative or weekly volume with the 30-day metric", () => {
    for (const s of ["~$70B volume on the chain, ~80% of stock-token volume", "$184.9M traded in 7 days across 31 pools, 50K+ holders (Sep 2026)", "Routed $1.87B of chain volume in one week", "$2.13B volume, $1.30B weekly RWA perps volume (Oct 2026)"])
      expect(parseSignalFigures(s).every((f) => f.kind === null), s).toBe(true);
    expect(parseSignalFigures("$40M volume in 30 days")[0].kind).toBe("volume30d");
  });
});

describe("conflict check", () => {
  it("passes a signal within 25% of the live metric of the same kind", () => {
    expect(checkSignal("$1B+ deposited into vaults", SNAP, { deposited: 1.06e9 }, END)?.conflict).toBeNull();
    expect(checkSignal("USDG supply on the chain about $641M", SNAP, { supply: 632e6 }, END)?.conflict).toBeNull();
    // A stated floor is no conflict when the live figure is above it.
    expect(checkSignal("Vault TVL past $100M", SNAP, { tvl: 400e6 }, END)?.conflict).toBeNull();
  });

  it("flags a figure more than 25% off, and hides it only once it is older than 30 days", () => {
    const fresh = checkSignal("$1M+ TVL, 52 assets across 28 Omnipools", SNAP, { tvl: 47_600 }, END);
    expect(fresh?.conflict).toMatchObject({ kind: "tvl", signal: 1e6, live: 47_600 });
    expect(fresh?.conflict?.gap ?? 0).toBeGreaterThan(SIGNAL_GAP);
    expect(fresh?.older).toBe(false);
    const old = checkSignal("About $218M TVL (Jul 2026)", SNAP, { tvl: 20e6 }, END);
    expect(old?.conflict?.kind).toBe("tvl");
    expect(old?.older).toBe(true);
    expect(SIGNAL_MAX_AGE_DAYS).toBe(30);
  });

  it("has nothing to compare when the live metric is missing or the kind is unknown", () => {
    expect(checkSignal("About $218M TVL (Jul 2026)", SNAP, { tvl: null }, END)).toMatchObject({ conflict: null, older: false });
    expect(checkSignal("$16.2B Robinhood volume (Sep 2026)", SNAP, { volume30d: 1e6 }, END)).toMatchObject({ conflict: null, older: false });
  });

  it("only hides signals in the dataset that both conflict and are old", () => {
    for (const p of projects.filter((x) => x.signal?.older)) expect(p.signal?.conflict, p.name).not.toBeNull();
  });
});
