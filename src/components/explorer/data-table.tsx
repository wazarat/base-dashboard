"use client";

import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/atlas/chart-card";
import { InfoTip } from "@/components/atlas/info-tip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export const tableFeaturesConfig = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

export type Features = typeof tableFeaturesConfig;

/** Per-column presentation hints read by DataTable. */
export interface ColumnMeta {
  align?: "right";
  /** Hide the column below this Tailwind breakpoint (responsive without a chooser). */
  hideBelow?: "sm" | "md" | "lg";
  /** Marks estimated figures; the header says "(estimate)" after the label. */
  estimate?: boolean;
  /** Help text rendered as an InfoTip beside the header label, outside the sort button. */
  info?: React.ReactNode;
}

export function makeColumnHelper<T extends RowData>() {
  return createColumnHelper<Features, T>();
}
export const projectColumnHelper = makeColumnHelper<Project>();
// The helper itself types its column list as ColumnDef<..., any>; mirror that so typed accessors assign cleanly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyColumnDef<T extends RowData> = ColumnDef<Features, T, any>;
export type ProjectColumnDef = AnyColumnDef<Project>;

const HIDE: Record<NonNullable<ColumnMeta["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

interface Props<T extends RowData> {
  data: T[];
  columns: AnyColumnDef<T>[];
  initialSorting?: SortingState;
  initialVisibility?: ColumnVisibilityState;
  pageSize?: number;
  chooser?: boolean;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  getRowId?: (row: T, index: number) => string;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  dense?: boolean;
  /** Rendered under the table, e.g. a data caveat. */
  footer?: React.ReactNode;
  /** Controlled sort, for a table that keeps its sort in the URL. */
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
}

export function DataTable<T extends RowData>({
  data,
  columns,
  initialSorting = [],
  initialVisibility = {},
  pageSize = 25,
  chooser = false,
  onRowClick,
  rowClassName,
  getRowId,
  toolbar,
  emptyMessage,
  dense,
  footer,
  sorting: controlledSorting,
  onSortingChange,
}: Props<T>) {
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSorting);
  const sorting = controlledSorting ?? localSorting;
  const setSorting = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    if (onSortingChange) onSortingChange(next);
    else setLocalSorting(next);
  };
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(initialVisibility);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const table = useTable({
    features: tableFeaturesConfig,
    columns,
    data,
    getRowId,
    state: { sorting, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    autoResetPageIndex: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex } = table.state.pagination;
  const from = data.length === 0 ? 0 : pageIndex * table.state.pagination.pageSize + 1;
  const to = Math.min(data.length, (pageIndex + 1) * table.state.pagination.pageSize);
  const metaOf = (def: { meta?: unknown }) => (def.meta ?? {}) as ColumnMeta;

  return (
    <div className="space-y-2">
      {(chooser || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          {chooser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Columns3 className="size-3.5" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table.getAllLeafColumns().map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(Boolean(v))}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {data.length === 0 ? (
        <div className="px-5">
          <EmptyState message={emptyMessage} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={cn(dense && "text-xs")}>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header, i) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const m = metaOf(header.column.columnDef);
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "whitespace-nowrap",
                          i === 0 && "pl-5",
                          i === hg.headers.length - 1 && "pr-5",
                          m.align === "right" && "text-right",
                          m.hideBelow && HIDE[m.hideBelow],
                        )}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      >
                        <span className={cn("inline-flex items-center gap-1", m.align === "right" && "flex-row-reverse")}>
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn("inline-flex items-center gap-1 rounded hover:text-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60", m.align === "right" && "flex-row-reverse")}
                            >
                              <table.FlexRender header={header} />
                              {m.estimate && <span className="font-normal text-ink-300">(estimate)</span>}
                              {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                          {m.info && <InfoTip label={`About ${typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : header.column.id}`}>{m.info}</InfoTip>}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell, i, arr) => {
                    const m = metaOf(cell.column.columnDef);
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "align-top",
                          i === 0 && "pl-5",
                          i === arr.length - 1 && "pr-5",
                          m.align === "right" && "tabular text-right",
                          m.hideBelow && HIDE[m.hideBelow],
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {footer && <div className="px-5 text-xs text-ink-300">{footer}</div>}
      {data.length > 0 && pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 px-5 text-xs text-ink-300">
          <span>
            {from}–{to} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="tabular px-1">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
