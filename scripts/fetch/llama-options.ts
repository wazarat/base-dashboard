/** Options notional and premium volume on the chain per protocol (DefiLlama /overview/options, two data types). */
import type { Ctx, RunResult } from "./context";
import { runOverviews } from "./llama-overview";

export const SPECS = [
  { kind: "options", dataType: "dailyNotionalVolume", file: "options-notional" },
  { kind: "options", dataType: "dailyPremiumVolume", file: "options-premium" },
];

export function run(ctx: Ctx): Promise<RunResult> {
  return runOverviews(ctx, "llama-options", SPECS);
}
