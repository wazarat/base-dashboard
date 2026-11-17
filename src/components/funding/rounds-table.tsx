"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { PlainLabel } from "@/components/atlas/plain-label";
import { DataTable, makeColumnHelper, type AnyColumnDef } from "@/components/explorer/data-table";
import { TALLY_CORRECT_URL, tallyCorrectUrl } from "@/lib/env";
import { fmtDate, fmtUsd, fmtUsdFull } from "@/lib/format";
import type { Round } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Where a reader can send a source for a round that has none: the Tally correction form with the project and page filled in. */
export function submitSourceUrl(project: string, base: string | null = TALLY_CORRECT_URL): string | null {
  return tallyCorrectUrl(base, project, "funding");
}

const h = makeColumnHelper<Round>();

/** Plain-text confidence word with the reason as a title; no chip. The word "re-verify" carries the difference, not a dimmer tone. */
export function ConfidenceText({ confidence }: { confidence: Round["confidence"] }) {
  const prior = confidence !== "Sourced";
  return (
    <PlainLabel className={cn("whitespace-nowrap")} title={prior ? "From prior knowledge; re-verify before quoting" : "Backed by the linked source"}>
      {prior ? "re-verify" : "sourced"}
    </PlainLabel>
  );
}

export function roundColumns(onOpenProject: (id: string) => void, onOpenInvestor?: (id: string) => void): AnyColumnDef<Round>[] {
  return [
    h.accessor("project", {
      header: "Project",
      cell: ({ row }) =>
        row.original.projectId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProject(row.original.projectId as string);
            }}
            className="text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
          >
            {row.original.project}
          </button>
        ) : (
          <span className="font-medium text-ink-50" title="No project row in the Atlas">{row.original.project}</span>
        ),
      sortFn: "alphanumeric",
    }),
    h.accessor("roundType", { header: "Round", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span> }),
    h.accessor((r) => r.date ?? undefined, { id: "date", header: "Date", cell: ({ getValue }) => (getValue() ? fmtDate(getValue() as string) : <span className="text-ink-300">undated</span>), sortUndefined: "last", meta: { hideBelow: "sm" } }),
    h.accessor((r) => r.amount ?? undefined, {
      id: "amount",
      header: "Amount",
      cell: ({ row }) => (row.original.amount === null ? <span className="text-ink-300" title={row.original.amountNote ?? undefined}>undisclosed</span> : <span title={`${fmtUsdFull(row.original.amount)}${row.original.amountNote ? ` · ${row.original.amountNote}` : ""}`}>{fmtUsd(row.original.amount)}</span>),
      sortUndefined: "last",
      meta: { align: "right" },
    }),
    h.accessor((r) => r.leadInvestors.join(", ") || undefined, {
      id: "lead",
      header: "Lead investors",
      cell: ({ row }) => (
        <span className="flex max-w-xs flex-wrap gap-x-1">
          {row.original.leadInvestors.length === 0 && <span className="text-ink-300">none</span>}
          {row.original.leadInvestors.map((n, i) => (
            <span key={n}>
              {onOpenInvestor ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInvestor(n); }} className="underline-offset-2 hover:underline">
                  {n}
                </button>
              ) : (
                n
              )}
              {i < row.original.leadInvestors.length - 1 ? "," : ""}
            </span>
          ))}
        </span>
      ),
      sortUndefined: "last",
      meta: { hideBelow: "md" },
    }),
    h.accessor((r) => (r.related ? 1 : 0), { id: "related", header: "RH Chain", cell: ({ getValue }) => (getValue() ? <span title="Base related">yes</span> : <span>no</span>), meta: { hideBelow: "lg" } }),
    h.accessor("confidence", { header: "Confidence", cell: ({ getValue }) => <ConfidenceText confidence={getValue()} /> }),
    h.accessor((r) => r.sourceUrl ?? undefined, {
      id: "source",
      header: "Source",
      cell: ({ getValue, row }) => {
        if (getValue())
          return (
            <a href={getValue() as string} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              link <ExternalLink className="size-3 text-ink-300" />
            </a>
          );
        const submit = submitSourceUrl(row.original.project);
        return submit ? (
          <a href={submit} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid="submit-source" className="whitespace-nowrap text-ink-300 underline underline-offset-2 hover:text-ink-50">
            Submit a source
          </a>
        ) : (
          <span className="text-ink-300">none</span>
        );
      },
      sortUndefined: "last",
      meta: { hideBelow: "sm" },
    }),
  ];
}

export function RoundsTable({ rounds, onOpenProject, onOpenInvestor, pageSize = 25, dense, chooser, initialVisibility }: { rounds: Round[]; onOpenProject: (id: string) => void; onOpenInvestor?: (name: string) => void; pageSize?: number; dense?: boolean; /** Offer the column chooser, for a host too narrow to show every column at once. */ chooser?: boolean; initialVisibility?: Record<string, boolean> }) {
  const columns = useMemo(() => roundColumns(onOpenProject, onOpenInvestor), [onOpenProject, onOpenInvestor]);
  return (
    <DataTable
      data={rounds}
      columns={columns}
      initialSorting={[{ id: "date", desc: true }]}
      pageSize={pageSize}
      dense={dense}
      chooser={chooser}
      initialVisibility={initialVisibility}
      getRowId={(r) => r.id}
      emptyMessage="No funding rounds recorded for this selection."
    />
  );
}
