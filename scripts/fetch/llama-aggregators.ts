/** DEX aggregator volume on the chain per protocol (DefiLlama /overview/aggregators). Routed volume repeats DEX volume, so it never enters a chain KPI. */
import type { Ctx, RunResult } from "./context";
import { runOverviews } from "./llama-overview";

export const SPEC = { kind: "aggregators", file: "aggregator-volume" };

export function run(ctx: Ctx): Promise<RunResult> {
  return runOverviews(ctx, "llama-aggregators", [SPEC]);
}
