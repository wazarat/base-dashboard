/** Open interest on the chain per perps or prediction venue (DefiLlama /overview/open-interest). A level read on a day, never summed over a window. */
import type { Ctx, RunResult } from "./context";
import { runOverviews } from "./llama-overview";

export const SPEC = { kind: "open-interest", file: "open-interest", level: true };

export function run(ctx: Ctx): Promise<RunResult> {
  return runOverviews(ctx, "llama-open-interest", [SPEC]);
}
