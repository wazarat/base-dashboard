/**
 * Morpho vaults on chain 4663 (the free GraphQL API, vaultV2s): assets, net APY and curator per vault.
 * A vault's assets are deposits that already sit in Morpho's markets, so curator figures are always
 * flagged double counted and never enter a chain KPI.
 */
import path from "node:path";
import type { MorphoVaultRecord, MorphoVaultsFile } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { createClient } from "./http";
import { MORPHO_URL } from "./morpho";

export const VAULTS_FILE = path.join(HISTORY, "morpho", "vaults.json");
export const VAULTS_PAGE = 100;
export const vaultsQuery = (skip = 0) =>
  `{ vaultV2s(first: ${VAULTS_PAGE}, skip: ${skip}, where: { chainId_in: [4663] }) { items { address name symbol totalAssetsUsd netApy curators { items { name } } asset { symbol address } } } }`;

type Json = { data?: { vaultV2s?: { items?: Array<Record<string, unknown>> } }; errors?: unknown[] };

export function parseVaults(json: Json): MorphoVaultRecord[] {
  if (json.errors?.length && !json.data) throw new Error(`Morpho GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return (json.data?.vaultV2s?.items ?? [])
    .filter((v) => typeof v.address === "string")
    .map((v) => {
      const asset = v.asset as { symbol?: string; address?: string } | null;
      const curators = ((v.curators as { items?: Array<{ name?: string }> } | null)?.items ?? []).map((c) => (c.name ?? "").trim()).filter(Boolean);
      return {
        address: (v.address as string).toLowerCase(),
        name: String(v.name ?? ""),
        symbol: String(v.symbol ?? ""),
        assetsUsd: num(v.totalAssetsUsd),
        netApy: num(v.netApy),
        curators,
        asset: asset?.address ? { symbol: asset.symbol ?? "", address: asset.address.toLowerCase() } : null,
      };
    })
    .sort((a, b) => (b.assetsUsd ?? 0) - (a.assetsUsd ?? 0) || a.address.localeCompare(b.address));
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "morpho-vaults", minIntervalMs: 1000 });
  const vaults: MorphoVaultRecord[] = [];
  for (let page = 0; page < 10; page++) {
    const batch = parseVaults(await client.postJson<Json>(MORPHO_URL, { query: vaultsQuery(page * VAULTS_PAGE) }));
    vaults.push(...batch);
    if (batch.length < VAULTS_PAGE) break;
  }
  if (!vaults.length) return { rows: 0, calls: client.stats().calls, notes: ["skipped: Morpho lists no vaults on chain 4663"] };
  const file: MorphoVaultsFile = { asOf: ctx.today, vaults };
  if (!ctx.dryRun) writeJsonStable(VAULTS_FILE, file);
  const curators = new Set(vaults.flatMap((v) => v.curators));
  return { rows: vaults.length, calls: client.stats().calls, notes: [`${vaults.length} vaults on 4663, ${curators.size} named curators (${Array.from(curators).sort().join(", ")})`] };
}
