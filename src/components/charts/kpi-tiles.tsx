"use client";

import { StatCard } from "@/components/atlas/stat-card";
import { NOT_TRACKED, NOT_TRACKED_TIP } from "@/lib/coverage";
import { chainData, meta } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { fmtInt, fmtPct, fmtUsd, fmtUsdFull } from "@/lib/format";
import { fmtCountedTracked, kpiInfo, kpiValue, nativeRevenue, nativeRevenueInfo, stablecoinKpi, trackedCount } from "@/lib/kpi";
import { countedValue, sumCounted } from "@/lib/metrics";
import type { NumericMetricKey, Project } from "@/lib/types";

const MONEY: Array<{ key: NumericMetricKey; label: string }> = [
  { key: "tvl", label: "TVL" },
  { key: "volume", label: "30d DEX volume" },
  { key: "fees", label: "30d fees" },
  { key: "revenue", label: "30d revenue" },
];

/**
 * With no filters the money cards show DefiLlama's chain totals; with filters they
 * sum only what DefiLlama counts in that total, so a double count never inflates them.
 */
export function KpiTiles({ projects, total }: { projects: Project[]; total: number }) {
  const { activeCount } = useFilters();
  const unfiltered = activeCount === 0;
  const n = projects.length;
  const natCount = projects.filter((p) => p.chain === "Base native").length;
  const nat = nativeRevenue(projects);
  const tvlAll = sumCounted(projects, "tvl");
  const stable = stablecoinKpi(projects, unfiltered, meta.stablecoins);
  const natTvl = tvlAll ? projects.filter((p) => p.chain === "Base native").reduce((a, p) => a + (countedValue(p, "tvl") ?? 0), 0) / tvlAll : null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
      <StatCard
        label="Projects"
        value={fmtInt(n)}
        sub={n === total ? `${natCount} Base-native` : `of ${total}, ${natCount} native`}
        info={`Projects matching the current filters. The full list has ${fmtInt(total)} rows assembled from ${meta.discoveredVia.length} discovery sources.`}
      />
      {MONEY.map((m) => {
        const tracked = trackedCount(projects, m.key);
        const value = kpiValue(projects, m.key, unfiltered, chainData.latest);
        const quiet = value === null;
        return (
          <StatCard
            key={m.key}
            label={m.label}
            value={quiet ? NOT_TRACKED : fmtUsd(value)}
            full={quiet ? undefined : fmtUsdFull(value)}
            sub={fmtCountedTracked(tracked, n)}
            info={quiet ? NOT_TRACKED_TIP : kpiInfo(m.key, unfiltered, meta.chainTotals, m.label.replace(/^30d /, "30-day "))}
            quiet={quiet}
          />
        );
      })}
      <StatCard
        label="Stablecoin supply"
        value={stable.value === null ? NOT_TRACKED : fmtUsd(stable.value)}
        full={stable.value === null ? undefined : fmtUsdFull(stable.value)}
        sub={stable.sub}
        info={stable.info}
        quiet={stable.value === null}
      />
      <StatCard
        label="Native revenue share"
        value={nat.share === null ? NOT_TRACKED : fmtPct(nat.share)}
        sub={nat.share === null ? fmtCountedTracked(trackedCount(projects, "revenue"), n) : `Native TVL share ${fmtPct(natTvl)}`}
        info={nat.share === null ? NOT_TRACKED_TIP : nativeRevenueInfo(nat, meta.chainTotals)}
        quiet={nat.share === null}
      />
    </div>
  );
}
