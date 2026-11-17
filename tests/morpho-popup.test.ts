import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HAS_HISTORY } from "./helpers";
import { blockAsOf, MetricCell, MetricTrio } from "@/components/atlas/sector-metric-rows";
import { meta, projects } from "@/lib/data";
import { blockMetrics, LENDING_BRIEFS, LENDING_TRIO, type ResolvedMetric } from "@/lib/sector-metrics";

/** What the Morpho pop-up renders for Traction, built the same way src/components/drawer/project-modal.tsx builds it. */
describe.skipIf(!HAS_HISTORY)("Morpho pop-up", () => {
  const morpho = projects.find((p) => p.name === "Morpho")!;
  const end = meta.live?.windowEnd ?? null;
  const traction = blockMetrics(morpho, "traction", end);
  const by = (id: string) => traction.find((r) => r.def.id === id) as ResolvedMetric;
  const trio = LENDING_TRIO.map(by);
  const rows = traction.filter((r) => !trio.includes(r));
  const html = renderToStaticMarkup(
    createElement("div", null, createElement(MetricTrio, { rows: trio, briefs: LENDING_BRIEFS }), ...rows.map((r) => createElement("div", { key: r.def.id }, r.def.label, createElement(MetricCell, { r, sharedAsOf: blockAsOf(traction) })))),
  );

  it("lists the lending rows in order and has no DEX volume row", () => {
    // The rate and collateral rows appear once the yields and Morpho market sources have run; the six core lending rows are always there.
    const ids = traction.map((r) => r.def.id);
    expect(ids.filter((id) => !["supplyApy", "borrowApy", "stockBacked"].includes(id))).toEqual(["deposited", "borrowed", "tvl", "utilization", "fees", "revenue"]);
    expect(ids.indexOf("fees")).toBe(ids.length - 2);
    expect(traction.some((r) => r.def.id === "volume")).toBe(false);
    expect(html).not.toMatch(/DEX volume/);
  });

  it("shows Total deposited, Borrowed and TVL side by side, each with its one-line definition", () => {
    expect(trio.map((r) => r.state)).toEqual(["value", "value", "value"]);
    for (const label of ["Total deposited", "Borrowed", "TVL"]) expect(html).toContain(label);
    for (const brief of Object.values(LENDING_BRIEFS)) expect(html).toContain(brief);
    expect(html.match(/data-testid="metric-trio"/g)).toHaveLength(1);
  });

  it("agrees with itself, deposited is collateral plus lending supply and is larger than TVL", () => {
    const sm = morpho.sectorMetrics!;
    expect(by("deposited").value).toBe(sm.lendingSupply.v + sm.collateral.v);
    expect(by("deposited").value!).toBeGreaterThan(by("tvl").value!);
    // Deposits minus borrowed lands near DefiLlama's TVL, which is the same idea from another source.
    const implied = by("deposited").value! - by("borrowed").value!;
    expect(Math.abs(implied - by("tvl").value!) / by("tvl").value!).toBeLessThan(0.1);
  });

  it("shows utilization as borrowed over lending supply", () => {
    const u = by("utilization");
    expect(u.state).toBe("value");
    expect(u.value).toBeCloseTo(by("borrowed").value! / morpho.sectorMetrics!.lendingSupply.v, 6);
    expect(u.value!).toBeGreaterThan(0.5);
    expect(u.value!).toBeLessThanOrEqual(1);
    expect(html).toMatch(/data-metric="utilization" data-state="value"><span class="tabular">\d+%/);
  });

  it("shows revenue as $0 by design with the source's reason, not as Not tracked", () => {
    const rev = by("revenue");
    expect(rev).toMatchObject({ state: "zero-by-design", value: 0 });
    expect(rev.reason).toMatch(/no revenue/i);
    expect(html).toMatch(/data-metric="revenue" data-state="zero-by-design"><span class="tabular">\$0<\/span> <span[^>]*>by design/);
    expect(html).not.toContain("Not tracked");
  });

  it("carries the same zero into Financials as Protocol revenue", () => {
    const fin = blockMetrics(morpho, "financials", end);
    expect(fin.find((r) => r.def.id === "protocolRevenue")?.state).toBe("zero-by-design");
    expect(fin.find((r) => r.def.id === "supplySide")?.value).toBe(morpho.live?.supplySideRevenue);
  });
});

describe("an unmeasured project", () => {
  const end = meta.live?.windowEnd ?? null;

  it("has no traction rows and no tier, only facts where the data has them", () => {
    const wallet = projects.find((p) => p.name === "MetaMask")!;
    expect(wallet.tier).toBe("Not applicable");
    expect(blockMetrics(wallet, "traction", end)).toEqual([]);
  });

  it("shows exchange balances and locker value as flagged facts, never as traction", () => {
    const cex = projects.find((p) => p.subcategory === "Centralized exchanges" && p.tvl !== null);
    if (cex) expect(blockMetrics(cex, "facts", end)).toMatchObject([{ def: { id: "heldAssets" }, state: "value", flag: "cex" }]);
    const locker = projects.find((p) => p.subcategory === "Token lockers" && p.tvl !== null);
    if (locker) expect(blockMetrics(locker, "facts", end)[0]).toMatchObject({ def: { id: "lockedValue" }, state: "value", flag: "locker" });
  });
});

describe.skipIf(!HAS_HISTORY)("Morpho with the newer sources", () => {
  const morpho = projects.find((p) => p.name === "Morpho")!;
  const sm = morpho.sectorMetrics ?? {};

  it("shows the share of loans backed by stock tokens as a share between zero and one", () => {
    if (!sm.stockBacked) return;
    expect(sm.stockBacked.v).toBeGreaterThanOrEqual(0);
    expect(sm.stockBacked.v).toBeLessThanOrEqual(1);
  });

  it("shows APYs as shares, not percent figures", () => {
    for (const id of ["supplyApy", "borrowApy"]) if (sm[id]) expect(sm[id].v, id).toBeLessThan(1);
  });
});
