/**
 * Morpho vaults on Base (the free GraphQL API, MetaMorpho vaults and vault V2s): assets, net APY and curator per vault.
 * A V2 vault can hold shares of a V1 vault, so per-curator sums can overlap; they are never added to a chain total.
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
import { CHAIN } from "../../src/lib/chain";

export const VAULTS_FILE = path.join(HISTORY, "morpho", "vaults.json");
export const VAULTS_PAGE = 100;
/** Vault V2s, largest first. */
export const vaultsQuery = (skip = 0) =>
  `{ vaultV2s(first: ${VAULTS_PAGE}, skip: ${skip}, where: { chainId_in: [${CHAIN.morphoChainId}] }, orderBy: TotalAssetsUsd, orderDirection: Desc) { items { address name symbol totalAssetsUsd netApy curators { items { name } } asset { symbol address } } } }`;
/** Original MetaMorpho vaults, largest first. Most curated deposits on Base still sit in these. */
export const v1VaultsQuery = (skip = 0) =>
  `{ vaults(first: ${VAULTS_PAGE}, skip: ${skip}, where: { chainId_in: [${CHAIN.morphoChainId}] }, orderBy: TotalAssetsUsd, orderDirection: Desc) { items { address name symbol asset { symbol address } state { totalAssetsUsd netApy curators { name } } } } }`;
/** Pages of 100 per vault kind; the long tail below the 300 largest is dust. */
export const VAULT_PAGES = 3;

type Json = { data?: { vaultV2s?: { items?: Array<Record<string, unknown>> }; vaults?: { items?: Array<Record<string, unknown>> } }; errors?: unknown[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const assetOf = (v: Record<string, unknown>) => {
  const asset = v.asset as { symbol?: string; address?: string } | null;
  return asset?.address ? { symbol: asset.symbol ?? "", address: asset.address.toLowerCase() } : null;
};
const byAssets = (a: MorphoVaultRecord, b: MorphoVaultRecord) => (b.assetsUsd ?? 0) - (a.assetsUsd ?? 0) || a.address.localeCompare(b.address);

export function parseVaults(json: Json): MorphoVaultRecord[] {
  if (json.errors?.length && !json.data) throw new Error(`Morpho GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return (json.data?.vaultV2s?.items ?? [])
    .filter((v) => typeof v.address === "string")
    .map((v) => ({
      address: (v.address as string).toLowerCase(),
      name: String(v.name ?? ""),
      symbol: String(v.symbol ?? ""),
      assetsUsd: num(v.totalAssetsUsd),
      netApy: num(v.netApy),
      curators: ((v.curators as { items?: Array<{ name?: string }> } | null)?.items ?? []).map((c) => (c.name ?? "").trim()).filter(Boolean),
      asset: assetOf(v),
    }))
    .sort(byAssets);
}

export function parseV1Vaults(json: Json): MorphoVaultRecord[] {
  if (json.errors?.length && !json.data) throw new Error(`Morpho GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return (json.data?.vaults?.items ?? [])
    .filter((v) => typeof v.address === "string")
    .map((v) => {
      const state = (v.state as { totalAssetsUsd?: unknown; netApy?: unknown; curators?: Array<{ name?: string }> } | null) ?? {};
      return {
        address: (v.address as string).toLowerCase(),
        name: String(v.name ?? ""),
        symbol: String(v.symbol ?? ""),
        assetsUsd: num(state.totalAssetsUsd),
        netApy: num(state.netApy),
        curators: (state.curators ?? []).map((c) => (c.name ?? "").trim()).filter(Boolean),
        asset: assetOf(v),
      };
    })
    .sort(byAssets);
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "morpho-vaults", minIntervalMs: 1000 });
  const byAddress = new Map<string, MorphoVaultRecord>();
  for (const [query, parse] of [[v1VaultsQuery, parseV1Vaults], [vaultsQuery, parseVaults]] as const) {
    for (let page = 0; page < VAULT_PAGES; page++) {
      const batch = parse(await client.postJson<Json>(MORPHO_URL, { query: query(page * VAULTS_PAGE) }));
      for (const v of batch) if (!byAddress.has(v.address)) byAddress.set(v.address, v);
      if (batch.length < VAULTS_PAGE) break;
    }
  }
  const vaults = Array.from(byAddress.values()).sort(byAssets);
  if (!vaults.length) return { rows: 0, calls: client.stats().calls, notes: ["skipped: Morpho lists no vaults on Base"] };
  const file: MorphoVaultsFile = { asOf: ctx.today, vaults };
  if (!ctx.dryRun) writeJsonStable(VAULTS_FILE, file);
  const curators = new Set(vaults.flatMap((v) => v.curators));
  return { rows: vaults.length, calls: client.stats().calls, notes: [`${vaults.length} vaults on Base, ${curators.size} named curators (${Array.from(curators).sort().join(", ")})`] };
}
