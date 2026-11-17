"use client";

import { RotateCcw, Search } from "lucide-react";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo } from "react";
import { Clamp } from "@/components/atlas/clamp";
import { chainText, PlainLabel } from "@/components/atlas/plain-label";
import { Segmented } from "@/components/atlas/segmented";
import { DataTable, makeColumnHelper } from "@/components/explorer/data-table";
import { MultiSelect } from "@/components/filters/multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activeBackerFilterCount, amountValue, applyBackerFilters, backerFacetOptions, disclosedBackers, displayAmount, displayInvestors, type BackerFilters, type YesNo } from "@/lib/backer-filters";
import { CHAIN_COLOR } from "@/lib/colors";
import type { NativeChain, Project } from "@/lib/types";

const list = parseAsArrayOf(parseAsString, ",").withDefault([]);
/** URL keys of this table's own filters. They stack on the project filters and never change them. */
export const backerParsers = {
  bq: parseAsString.withDefault(""),
  bt: list,
  bn: list,
  bk: parseAsStringLiteral(["yes", "no"] as const),
};

const YES_NO = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
type YesNoAny = (typeof YES_NO)[number]["value"];

const h = makeColumnHelper<Project>();
const muted = (word: string) => <span className="text-xs text-ink-300">{word}</span>;

/** Lean columns: project, type, investors, amount. Token and source live in the project modal. */
export function backerColumns(onOpenProject: (id: string) => void) {
  return [
    h.accessor("name", {
      header: "Project",
      sortFn: "alphanumeric",
      cell: ({ row }) => (
        <div>
          <button
            type="button"
            className="text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProject(row.original.id);
            }}
          >
            {row.original.name}
          </button>
          <div className="mt-0.5">
            <PlainLabel>{chainText(row.original.chain, true)}</PlainLabel>
          </div>
        </div>
      ),
    }),
    h.accessor("fundingType", { header: "Type", cell: ({ getValue }) => <span className="text-xs">{getValue()}</span> }),
    h.accessor((p) => displayInvestors(p.investors) ?? undefined, {
      id: "investors",
      header: "Investors / backers",
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v ? (
          <Clamp lines={3} className="w-64 whitespace-normal text-xs">
            {v}
          </Clamp>
        ) : (
          muted("none")
        );
      },
    }),
    h.accessor((p) => amountValue(p.amountRaised) ?? undefined, {
      id: "amount",
      header: "Amount raised",
      sortUndefined: "last",
      cell: ({ row }) => {
        const v = displayAmount(row.original.amountRaised);
        return v ? <span className="block w-36 whitespace-normal text-xs">{v}</span> : muted("undisclosed");
      },
    }),
    ];
}

/** Projects with named backers or a stated amount, sortable and filterable. One word for every empty value. */
export function BackersTable({ projects, onOpenProject, pageSize = 25 }: { projects: Project[]; onOpenProject: (id: string) => void; pageSize?: number }) {
  const [f, setF] = useQueryStates(backerParsers, { history: "replace", clearOnDefault: true });
  const filters: BackerFilters = f;
  const base = useMemo(() => disclosedBackers(projects), [projects]);
  const rows = useMemo(() => applyBackerFilters(base, filters), [base, filters]);
  const typeOptions = useMemo(() => backerFacetOptions(base, filters, "bt"), [base, filters]);
  const chainOptions = useMemo(() => backerFacetOptions(base, filters, "bn").map((o) => ({ ...o, color: CHAIN_COLOR[o.value as NativeChain] })), [base, filters]);
  const active = activeBackerFilterCount(filters);

  const columns = useMemo(() => backerColumns(onOpenProject), [onOpenProject]);

  const toolbar = (
    <>
      <div className="relative min-w-40 flex-1 basis-48 md:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-300" />
        <Input type="search" value={f.bq} onChange={(e) => void setF({ bq: e.target.value })} placeholder="Search project or backer" aria-label="Search backers" className="h-8 pl-8 text-xs" />
      </div>
      <MultiSelect label="Type" options={typeOptions} selected={f.bt} onChange={(v) => void setF({ bt: v })} searchable={false} />
      <MultiSelect label="Native chain" options={chainOptions} selected={f.bn} onChange={(v) => void setF({ bn: v })} searchable={false} />
      <div className="flex items-center gap-1.5">
        <span className="type-label text-ink-300">Has token</span>
        <Segmented<YesNoAny> size="sm" ariaLabel="Has token" value={f.bk ?? "any"} onChange={(v) => void setF({ bk: v === "any" ? null : (v as YesNo) })} options={YES_NO} />
      </div>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void setF({ bq: "", bt: [], bn: [], bk: null })} disabled={active === 0}>
        <RotateCcw className="size-3.5" /> Reset
      </Button>
      <p className="text-xs text-ink-300" aria-live="polite">
        Showing <span className="tabular font-medium text-ink-50">{rows.length}</span> of {base.length} projects
      </p>
    </>
  );

  return (
    <div data-testid="backers-table">
      <DataTable
        data={rows}
        columns={columns}
        toolbar={toolbar}
        initialSorting={[{ id: "amount", desc: true }]}
        pageSize={pageSize}
        getRowId={(p) => p.id}
        onRowClick={(p) => onOpenProject(p.id)}
        emptyMessage={base.length === 0 ? "No disclosed backers in this selection." : "No project matches these filters."}
      />
    </div>
  );
}
