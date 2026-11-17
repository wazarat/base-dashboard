"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Clamp } from "@/components/atlas/clamp";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { DataTable, makeColumnHelper } from "@/components/explorer/data-table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { events } from "@/lib/data";
import { displayUrl, fmtDate, fmtUsd } from "@/lib/format";
import type { EcosystemEvent } from "@/lib/types";

const h = makeColumnHelper<EcosystemEvent>();

/** Sortable incident list, worded as the sources report it (docs/ATLAS-UI.md, section 10). */
export function IncidentTable() {
  const incidents = useMemo(() => events.filter((e) => e.type === "Incident"), []);
  const columns = useMemo(
    () => [
      h.accessor("date", { header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap">{fmtDate(getValue())}</span> }),
      h.accessor("title", {
        header: "Event",
        cell: ({ row }) => (
          <div className="max-w-xs whitespace-normal">
            <div className="font-medium text-ink-50">{row.original.title}</div>
            {row.original.projects.length > 0 && <div className="text-xs text-ink-300">{row.original.projects.join(", ")}</div>}
          </div>
        ),
        sortFn: "alphanumeric",
      }),
      h.accessor((e) => e.detail ?? undefined, {
        id: "detail",
        header: "What happened",
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue() ? (
            <Clamp lines={3} className="max-w-md whitespace-normal text-xs">
              {getValue()}
            </Clamp>
          ) : (
            <span className="text-ink-300">none</span>
          ),
      }),
      h.accessor((e) => e.amount ?? undefined, {
        id: "amount",
        header: "Amount",
        sortUndefined: "last",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.amount === null ? (
            <span className="whitespace-normal text-ink-300">{row.original.amountNote ?? "undisclosed"}</span>
          ) : (
            <div>
              <div className="tabular">{fmtUsd(row.original.amount)}</div>
              {row.original.amountNote && <div className="max-w-[10rem] whitespace-normal text-[11px] text-ink-300">{row.original.amountNote}</div>}
            </div>
          ),
      }),
      h.accessor((e) => e.sourceUrl ?? undefined, {
        id: "source",
        header: "Source",
        sortUndefined: "last",
        cell: ({ getValue }) =>
          getValue() ? (
            <a href={getValue() as string} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline">
              {displayUrl(getValue() as string).split("/")[0]} <ExternalLink className="size-3 text-ink-300" />
            </a>
          ) : (
            <span className="text-ink-300">no source</span>
          ),
      }),
    ],
    [],
  );
  return (
    <Card className="gap-4">
      <CardHeader>
        <h3 className="type-card-title text-ink-50">Incidents ({incidents.length})</h3>
        <FilteredNote scope="chain" className="block" />
        <p className="text-sm text-ink-300">Dated incidents from the events file, worded as the sources report them. Sort any column; every row links to its source where one exists.</p>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable data={incidents} columns={columns} initialSorting={[{ id: "date", desc: true }]} pageSize={25} dense getRowId={(e) => e.id} emptyMessage="No incidents recorded." />
      </CardContent>
    </Card>
  );
}
