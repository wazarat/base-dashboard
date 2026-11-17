import { describe, expect, it } from "vitest";
import { aggregateInvestors, investorId, makeResolver, quarterOf, roundBucket, splitInvestors, toRound } from "@/lib/rounds";

const resolve = makeResolver([
  { id: "lighter", name: "Lighter" },
  { id: "ondo-global-markets", name: "Ondo Global Markets" },
  { id: "equalfi", name: "EqualFi" },
]);

describe("rounds", () => {
  it("parses a round with blanks as null and splits investors", () => {
    const r = toRound(
      { Project: "Lighter", "Round Type": "Series round", Date: "2025-11-11", "Amount (USD)": "68000000", "Amount Note": "At $1.5B valuation", "Lead Investors": "Founders Fund; Ribbit Capital", "Other Investors": "Haun Ventures; Robinhood", "Base Related": "Yes", Confidence: "Sourced", "Source URL": "https://x" },
      2,
      resolve,
    );
    expect(r.projectId).toBe("lighter");
    expect(r.amount).toBe(68_000_000);
    expect(r.leadInvestors).toEqual(["Founders Fund", "Ribbit Capital"]);
    expect(r.otherInvestors).toEqual(["Haun Ventures", "Robinhood"]);
    expect(r.related).toBe(true);
    expect(r.bucket).toBe("Series rounds");
    const u = toRound({ Project: "Camelot", "Round Type": "Strategic investment", Date: "", "Amount (USD)": "", "Lead Investors": "Tandem (Offchain Labs)", Confidence: "Prior knowledge (re-verify)" }, 3, resolve);
    expect(u.date).toBeNull();
    expect(u.amount).toBeNull();
    expect(u.projectId).toBeNull();
    expect(u.confidence).toBe("Prior knowledge (re-verify)");
    expect(u.bucket).toBe("Strategic");
  });
  it("resolves aliases and normalized names", () => {
    expect(toRound({ Project: "Ondo Global Markets", "Round Type": "Series A" }, 1, resolve).projectId).toBe("ondo-global-markets");
    expect(toRound({ Project: "EqualFi (EqualIndex)", "Round Type": "Program award" }, 1, resolve).projectId).toBe("equalfi");
    expect(splitInvestors("Undisclosed")).toEqual([]);
    expect(investorId("Tandem (Offchain Labs)")).toBe("tandem");
    expect(roundBucket("Token sale")).toBe("Token sale");
    expect(roundBucket("Ecosystem incentive")).toBe("Programs and awards");
    expect(quarterOf("2026-08-14")).toBe("2026 Q3");
  });
  it("aggregates investors with led counts and disclosed totals", () => {
    const rows = [
      toRound({ Project: "Lighter", "Round Type": "Series round", Date: "2025-11-11", "Amount (USD)": "68000000", "Lead Investors": "Founders Fund", "Other Investors": "Robinhood", "Base Related": "Yes" }, 1, resolve),
      toRound({ Project: "Arcus", "Round Type": "Strategic", Date: "2026-07-01", "Lead Investors": "Robinhood Crypto", "Base Related": "Yes" }, 2, resolve),
      toRound({ Project: "Allium", "Round Type": "Series A", Date: "2024-07-01", "Amount (USD)": "16500000", "Lead Investors": "Founders Fund; Founders Fund" }, 3, resolve),
    ];
    const inv = aggregateInvestors(rows);
    const ff = inv.find((i) => i.id === "founders-fund")!;
    expect(ff.deals).toBe(2);
    expect(ff.led).toBe(3);
    expect(ff.totalDisclosed).toBe(84_500_000);
    expect(ff.relatedDeals).toBe(1);
    expect(ff.projects.map((p) => p.name)).toEqual(["Lighter", "Allium"]);
    expect(inv[0].id).toBe("founders-fund");
  });
});

describe("investor aliases", () => {
  it("merges spellings of one firm and keeps different funds apart", async () => {
    const { aggregateInvestors, canonicalInvestor } = await import("@/lib/rounds");
    expect(canonicalInvestor("Andreessen Horowitz")).toBe("a16z crypto");
    expect(canonicalInvestor("a16z")).toBe("a16z crypto");
    expect(canonicalInvestor("Binance Labs")).toBe("YZi Labs");
    expect(canonicalInvestor("Paradigm Capital")).toBe("Paradigm");
    expect(canonicalInvestor("Coinbase")).toBe("Coinbase");
    expect(canonicalInvestor("Coinbase Ventures")).toBe("Coinbase Ventures");
    expect(canonicalInvestor("Base Ecosystem Fund (Coinbase Ventures)")).toBe("Base Ecosystem Fund");
    expect(canonicalInvestor("Binance Labs")).toBe("YZi Labs");
    expect(canonicalInvestor("a16z")).toBe("a16z crypto");
    expect(canonicalInvestor("Andreessen Horowitz")).toBe("a16z crypto");
    expect(canonicalInvestor("Paradigm Capital")).toBe("Paradigm");
    expect(canonicalInvestor("Lightspeed Faction")).toBe("Lightspeed Faction");
    const base = { projectId: null, roundType: "Seed", bucket: "Seed and angel" as const, date: null, amount: null, amountNote: null, related: false, confidence: "Sourced" as const, sourceUrl: null };
    const inv = aggregateInvestors([
      { ...base, id: "a", project: "A", leadInvestors: ["a16z"], otherInvestors: ["Lightspeed Faction"] },
      { ...base, id: "b", project: "B", leadInvestors: ["Andreessen Horowitz"], otherInvestors: ["Lightspeed Venture Partners"] },
    ]);
    expect(inv.find((i) => i.name === "a16z crypto")?.deals).toBe(2);
    expect(inv.filter((i) => i.name.startsWith("Lightspeed")).map((i) => i.deals)).toEqual([1, 1]);
  });
});
