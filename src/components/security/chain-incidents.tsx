"use client";

import { ChartTable } from "@/components/atlas/chart-table";
import { InfoTip } from "@/components/atlas/info-tip";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { hacks } from "@/lib/data";
import { fmtDate, fmtUsd } from "@/lib/format";

/**
 * Incidents DefiLlama records for Base (docs/SECTOR-METRICS.md, section 3). Chain level only:
 * the list lives on the Security page and is never attached to a project's pop-up or a sector card.
 * An incident that hit several chains keeps its whole amount, with the number of chains beside it.
 */
export function ChainIncidents() {
  const total = hacks.reduce((a, h) => a + (h.amount ?? 0), 0);
  return (
    <Card className="gap-3" id="chain-incidents">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <h3 className="type-card-title text-ink-50">Incidents recorded for the chain</h3>
          <InfoTip label="About incidents recorded for the chain">
            Exploits and losses that DefiLlama&rsquo;s incident list attributes to Base, newest first. An incident on several chains shows its whole amount, since the source does not split it by chain. This is a list of reports, not a rating of any project.
          </InfoTip>
        </div>
        <p className="text-sm text-ink-300">
          {hacks.length === 0 ? "None recorded." : `${hacks.length} ${hacks.length === 1 ? "incident" : "incidents"}, ${fmtUsd(total)} in reported losses across every chain they touched.`}
        </p>
      </CardHeader>
      {hacks.length > 0 && (
        <CardContent>
          <ChartTable
            spec={{
              columns: [
                { key: "date", label: "Date", format: (v) => fmtDate(v as string) },
                { key: "name", label: "Incident" },
                { key: "classification", label: "Type", empty: "none" },
                { key: "technique", label: "Technique", empty: "none" },
                { key: "amount", label: "Amount", align: "right", format: (v) => (v === null || v === undefined ? "undisclosed" : fmtUsd(v as number)) },
                { key: "chains", label: "Chains hit", align: "right" },
              ],
              rows: hacks as unknown as Record<string, unknown>[],
              filename: "chain-incidents.csv",
            }}
          />
        </CardContent>
      )}
    </Card>
  );
}
