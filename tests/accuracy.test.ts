import { describe, expect, it } from "vitest";
import { describeGap, SOURCE_GAP_FAIL, SOURCE_GAP_FLOOR, sourceGap } from "@/lib/accuracy";

const a = (value: number, asOf = "2026-11-10") => ({ source: "Morpho API", value, asOf });
const b = (value: number, asOf = "2026-11-09") => ({ source: "DefiLlama", value, asOf });

describe("one source per number", () => {
  it("logs a small gap and passes", () => {
    const g = sourceGap("Morpho", "total deposited", true, a(1062e6), b(1074e6));
    expect(g.gap).toBeCloseTo(0.0113, 3);
    expect(g).toMatchObject({ comparable: true, fail: false });
    expect(describeGap(g)).toContain("gap 1.1%");
  });

  it("fails a headline gap over 10%", () => {
    expect(SOURCE_GAP_FAIL).toBe(0.1);
    expect(sourceGap("Morpho", "total deposited", true, a(1000e6), b(880e6)).fail).toBe(true);
    expect(sourceGap("Morpho", "total deposited", true, a(1000e6), b(905e6)).fail).toBe(false);
  });

  it("only logs a gap on a metric that is not a headline", () => {
    expect(sourceGap("Morpho", "borrowed", false, a(1000e6), b(500e6))).toMatchObject({ comparable: true, fail: false });
  });

  it("does not fail when a source lags by more than a day or the figure is small", () => {
    const lagging = sourceGap("Morpho", "total deposited", true, a(1000e6, "2026-11-10"), b(500e6, "2026-11-07"));
    expect(lagging).toMatchObject({ comparable: false, fail: false });
    expect(describeGap(lagging)).toContain("not comparable");
    const small = sourceGap("Tiny", "supply", true, a(SOURCE_GAP_FLOOR / 2), b(SOURCE_GAP_FLOOR / 10));
    expect(small).toMatchObject({ comparable: false, fail: false });
  });
});
