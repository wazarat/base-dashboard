/** Bridge aggregator volume on the chain per protocol (DefiLlama /overview/bridge-aggregators). Per-bridge volume is a paid feed and stays Not tracked. */
import type { Ctx, RunResult } from "./context";
import { runOverviews } from "./llama-overview";

export const SPEC = { kind: "bridge-aggregators", file: "bridge-aggregator-volume" };

export function run(ctx: Ctx): Promise<RunResult> {
  return runOverviews(ctx, "llama-bridge-aggregators", [SPEC]);
}
