/**
 * Re-applies the chain-total flags in src/lib/flags.ts to the stored protocol list, without fetching.
 * Use after changing a flag rule; the next refresh writes the same flags on its own.
 *
 *   npx tsx scripts/reflag.ts
 */
import path from "node:path";
import { tvlExclusion } from "../src/lib/flags";
import type { LlamaProtocolSnap } from "../src/lib/history-types";
import { HISTORY } from "./lib/paths";
import { readJson, writeJsonStable } from "./lib/store";

const dir = path.join(HISTORY, "defillama");
const protocols = readJson<LlamaProtocolSnap[]>(path.join(dir, "protocols.json"), []);
const adapters = readJson<Record<string, { doublecounted: boolean | null }>>(path.join(dir, "adapters.json"), {});
let changed = 0;
// Same TVL rule as inChainTotal in src/lib/flags.ts; volume, fees and revenue flags depend on the overview breakdown and stay as stored.
const next = protocols.map((p) => {
  const ex = tvlExclusion(p, adapters[p.slug]?.doublecounted ?? null);
  const tvl = ex === null;
  if ((p.tvlExclusion ?? null) !== ex || (p.inChainTotal && p.inChainTotal.tvl !== tvl)) changed += 1;
  return { ...p, tvlExclusion: ex, inChainTotal: p.inChainTotal ? { ...p.inChainTotal, tvl } : p.inChainTotal };
});
writeJsonStable(path.join(dir, "protocols.json"), next);
console.log(`${changed} protocols changed flags`);
