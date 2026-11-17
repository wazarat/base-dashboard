import { describe, expect, it } from "vitest";
import { CHART_METRIC_KEYS, CHART_METRIC_PARSERS } from "@/lib/chart-metric";
import { CARRIED_PARAMS } from "@/lib/filters";

describe("per-chart metric keys", () => {
  it("only the sector key accepts Projects", () => {
    expect(CHART_METRIC_PARSERS.tm.parse("count")).toBe("count");
    expect(CHART_METRIC_PARSERS.cm.parse("count")).toBeNull();
    expect(CHART_METRIC_PARSERS.mm.parse("volume")).toBe("volume");
    expect(Object.keys(CHART_METRIC_PARSERS)).not.toContain("lm");
    expect(CHART_METRIC_PARSERS.xm.parse("nope")).toBeNull();
  });
  it("defaults to Projects for sectors and TVL elsewhere", () => {
    expect(CHART_METRIC_PARSERS.tm.defaultValue).toBe("count");
    expect(CHART_METRIC_PARSERS.mm.defaultValue).toBe("tvl");
  });
  it("every key travels between pages", () => {
    for (const k of CHART_METRIC_KEYS) expect(CARRIED_PARAMS).toContain(k);
    expect(CARRIED_PARAMS).not.toContain("metric");
  });
});
