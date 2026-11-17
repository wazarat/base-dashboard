import type { DateStr } from "../../src/lib/dates";
import type { HistoryMeta, SourceId } from "../../src/lib/history-types";

export interface Ctx {
  mode: "daily" | "backfill";
  today: DateStr;
  nowMs: number;
  meta: HistoryMeta;
  env: Record<string, string | undefined>;
  dryRun: boolean;
  /**
   * When optional work (history walks, pool crawls, hourly candles) should stop so the whole refresh fits its
   * time budget. Required readings for the day always run; cursors carry the rest to the next run.
   */
  deadlineMs?: number;
}

/** True while there is time for optional work. */
export function hasTime(ctx: Pick<Ctx, "deadlineMs">, now = Date.now()): boolean {
  return ctx.deadlineMs === undefined || now < ctx.deadlineMs;
}

export interface RunResult {
  rows: number;
  calls: number;
  notes: string[];
}

export interface Source {
  id: SourceId;
  run: (ctx: Ctx) => Promise<RunResult>;
}
