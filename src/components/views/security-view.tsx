"use client";

import { ChainChecklist } from "@/components/security/chain-checklist";
import { ChainIncidents } from "@/components/security/chain-incidents";
import { FlagsBySector } from "@/components/security/flags-by-sector";
import { IncidentTable } from "@/components/security/incident-table";
import { RedFlagCounts } from "@/components/security/red-flag-counts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useFilters } from "@/lib/filters";
import { securityResearched } from "@/lib/red-flags";

/** Aggregates only: no named High, Medium or Low lists and no per-project rating (docs/ATLAS-UI.md, section 10). */
export function SecurityView() {
  const { filtered } = useFilters();
  const researched = filtered.filter(securityResearched).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <ChainChecklist className="xl:col-span-1" />
        <div className="space-y-4 xl:col-span-2">
          <RedFlagCounts projects={filtered} />
          <FlagsBySector projects={filtered} />
        </div>
      </div>

      <IncidentTable />

      <ChainIncidents />

      <Card className="gap-3">
        <CardHeader>
          <h3 className="type-card-title text-ink-50">How to read this</h3>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-ink-300">
          <p>
            <strong className="font-medium text-ink-50">Flags</strong> are keyword matches on the researcher&apos;s notes for the {researched} researched projects in this selection. They count what the sources say; they do not rate a project, and a flag is not a finding of wrongdoing.
          </p>
          <p>
            <strong className="font-medium text-ink-50">Not researched</strong> means security was never checked for that project. <strong className="font-medium text-ink-50">Checked, nothing found</strong> means the research pass found no audit, incident or flag in the sources it looked at; it does not mean the project is unaudited or safe.
          </p>
          <p>
            <strong className="font-medium text-ink-50">Incidents</strong> are listed as reported, including events caused by third parties such as impersonation tokens. Nothing here is a judgement of intent.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
