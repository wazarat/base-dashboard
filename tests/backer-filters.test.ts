import { describe, expect, it } from "vitest";
import { activeBackerFilterCount, amountValue, applyBackerFilters, backerFacetOptions, disclosedBackers, displayAmount, displayInvestors, displayToken, isPlaceholder, NO_BACKER_FILTERS, tokenNote } from "@/lib/backer-filters";
import { projects } from "@/lib/data";

const rows = disclosedBackers(projects);

describe("disclosed backers", () => {
  it("lists projects with a funding type on record and either backers or a stated amount", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((p) => p.fundingType !== "Not researched" && p.fundingType !== "Not disclosed")).toBe(true);
    expect(rows.every((p) => p.amountDisclosed || Boolean(p.investors))).toBe(true);
  });

  it("reads every way of writing nothing as one placeholder", () => {
    for (const t of ["None", "none", "NONE", "Unknown", "None confirmed", "None disclosed", "Undisclosed", "N/A", "n/a", "-", "", "  ", "None."]) expect(isPlaceholder(t), t).toBe(true);
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
    for (const t of ["ACX", "N/A (acquisition ~$200M)", "n/a (DAO treasury)", "Undisclosed (Sep 4, 2026)", "Public company", "$30K (Jul 15, 2026)"]) expect(isPlaceholder(t), t).toBe(false);
  });

  it("shows a ticker or nothing, never the raw placeholder text", () => {
    expect(displayToken({ token: "ACX", tokenRaw: "ACX" })).toBe("ACX");
    expect(displayToken({ token: null, tokenRaw: "None" })).toBeNull();
    expect(displayToken({ token: null, tokenRaw: "Unknown" })).toBeNull();
    expect(displayToken({ token: null, tokenRaw: "None confirmed" })).toBeNull();
    expect(displayToken({ token: null, tokenRaw: null })).toBeNull();
    // "None" followed by a note still means no token; the note is kept for the cell.
    expect(displayToken({ token: "None (issues USDC)", tokenRaw: "None (issues USDC)" })).toBeNull();
    expect(tokenNote({ token: "None (issues USDC)", tokenRaw: "None (issues USDC)" })).toBe("(issues USDC)");
    expect(tokenNote({ token: "None announced", tokenRaw: "None announced" })).toBe("announced");
    expect(tokenNote({ token: null, tokenRaw: "None" })).toBeNull();
    expect(tokenNote({ token: "ACX", tokenRaw: "ACX" })).toBeNull();
    expect(displayToken({ token: "ZRO (STG for Stargate)", tokenRaw: "ZRO (STG for Stargate)" })).toBe("ZRO (STG for Stargate)");
    // On the real rows no token cell can read "None", "Unknown" or "None confirmed".
    const shown = new Set(rows.map((p) => displayToken(p) ?? "none"));
    for (const bad of ["None", "Unknown", "None confirmed", "N/A"]) expect(shown.has(bad), bad).toBe(false);
    expect([...shown].some((v) => /^None\b/.test(v))).toBe(false);
  });

  it("keeps informative amount text and drops bare placeholders", () => {
    expect(displayAmount("Unknown")).toBeNull();
    expect(displayAmount("Undisclosed")).toBeNull();
    expect(displayAmount("n/a")).toBeNull();
    expect(displayAmount("N/A (acquisition ~$200M)")).toBe("N/A (acquisition ~$200M)");
    expect(displayAmount("~$564M (latest Feb 2022)")).toBe("~$564M (latest Feb 2022)");
    expect(displayInvestors("Unknown")).toBeNull();
    expect(displayInvestors("Paradigm, a16z")).toBe("Paradigm, a16z");
  });

  it("reads a dollar figure out of the amount text for sorting", () => {
    expect(amountValue("~$564M (latest Feb 2022)")).toBe(564_000_000);
    expect(amountValue("$2B latest (Mar 2025)")).toBe(2_000_000_000);
    expect(amountValue("$30K (Jul 15, 2026)")).toBe(30_000);
    expect(amountValue("~$56.5M+ (latest Jun 2026)")).toBe(56_500_000);
    expect(amountValue("$1,250,000")).toBe(1_250_000);
    expect(amountValue("Unknown")).toBeNull();
    expect(amountValue("Public company")).toBeNull();
    expect(amountValue(null)).toBeNull();
  });

  it("filters by search, type, native chain and token, and stacks them", () => {
    expect(applyBackerFilters(rows, NO_BACKER_FILTERS)).toHaveLength(rows.length);
    const vc = applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bt: ["VC-backed"] });
    expect(vc.length).toBeGreaterThan(0);
    expect(vc.every((p) => p.fundingTypes.includes("VC-backed"))).toBe(true);
    const withToken = applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bk: "yes" });
    const withoutToken = applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bk: "no" });
    expect(withToken.length + withoutToken.length).toBe(rows.length);
    expect(withToken.every((p) => displayToken(p) !== null)).toBe(true);
    const native = applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bn: ["Base native"] });
    expect(native.every((p) => p.chain === "Base native")).toBe(true);
    const both = applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bt: ["VC-backed"], bk: "yes" });
    expect(both.length).toBeLessThanOrEqual(Math.min(vc.length, withToken.length));
    expect(applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bq: "zzzz-no-match" })).toEqual([]);
    const first = rows[0];
    expect(applyBackerFilters(rows, { ...NO_BACKER_FILTERS, bq: first.name.toUpperCase() }).some((p) => p.id === first.id)).toBe(true);
  });

  it("counts each facet option among rows matching the other filters", () => {
    const types = backerFacetOptions(rows, NO_BACKER_FILTERS, "bt");
    expect(types.find((o) => o.value === "VC-backed")!.count).toBe(rows.filter((p) => p.fundingTypes.includes("VC-backed")).length);
    const chains = backerFacetOptions(rows, { ...NO_BACKER_FILTERS, bt: ["VC-backed"] }, "bn");
    expect(chains.reduce((a, o) => a + o.count, 0)).toBe(rows.filter((p) => p.fundingTypes.includes("VC-backed")).length);
    // A selected value stays listed even when the other filters leave it empty.
    const kept = backerFacetOptions(rows, { ...NO_BACKER_FILTERS, bq: "zzzz-no-match", bt: ["VC-backed"] }, "bt");
    expect(kept).toEqual([{ value: "VC-backed", count: 0 }]);
  });

  it("counts active filters", () => {
    expect(activeBackerFilterCount(NO_BACKER_FILTERS)).toBe(0);
    expect(activeBackerFilterCount({ bq: " x ", bt: ["a", "b"], bn: ["c"], bk: "no" })).toBe(5);
  });
});
