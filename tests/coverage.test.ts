import { describe, expect, it } from "vitest";
import { COVERAGE_TERMS, coverage, fmtTracked, NOT_TRACKED } from "@/lib/coverage";
import { projects } from "@/lib/data";
import { fmtCompact, fmtInt, fmtPct, fmtPctSigned, fmtRatio, fmtUsd, fmtUsdFull } from "@/lib/format";
import { applyFilters } from "@/lib/filters";

describe("coverage language", () => {
  it("says Not tracked for a missing metric and no history for a missing change", () => {
    for (const f of [fmtUsd, fmtUsdFull, fmtInt, fmtPct, fmtCompact]) expect(f(null)).toBe(NOT_TRACKED);
    expect(fmtPctSigned(null)).toBe("no history");
    expect(fmtRatio(null)).toBe("no history");
    for (const f of [fmtUsd, fmtUsdFull, fmtInt, fmtPct, fmtCompact, fmtPctSigned, fmtRatio]) expect(f(null)).not.toContain("—");
  });
  it("counts coverage per metric and words it", () => {
    const exchanges = applyFilters(projects, { sector: ["Exchanges & On/Off-Ramps"] });
    expect(coverage(exchanges, "volume")).toEqual({ tracked: 1, total: 32 });
    expect(fmtTracked(coverage(exchanges, "volume"))).toBe("Tracked for 1 of 32 projects");
    expect(fmtTracked({ tracked: 1, total: 1 })).toBe("Tracked for 1 of 1 project");
  });
  it("explains every coverage term once", () => {
    expect(COVERAGE_TERMS.map((t) => t.term)).toEqual(["Not tracked", "Not researched", "Not disclosed", "Checked, nothing found", "no history"]);
  });
});
