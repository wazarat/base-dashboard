/**
 * Keyed Blockscout snapshots for mapped NFT collections (nft-collection role in data/contracts.csv):
 * holders and transfers in the last 30 days, counted page by page up to RECENT_TRANSFER_CAP.
 */
import { isNftRole } from "../../src/lib/contract-roles";
import { runFor } from "./blockscout-tokens";
import type { Ctx, RunResult } from "./context";

export function run(ctx: Ctx): Promise<RunResult> {
  return runFor(ctx, (c) => isNftRole(c.role), true, "NFT collections");
}
