/**
 * Spoof guard (pure). Many fake tokens on the chain copy real names, so a mapped address is only
 * trusted when what Blockscout reports for it agrees with the row in data/contracts.csv or
 * data/stablecoin-map.csv. Mapping by name or symbol alone is never allowed.
 */
import { isFungibleRole, isNftRole } from "./contract-roles";
import type { TokenMetaRecord } from "./history-types";

export interface GuardRow {
  project: string;
  address: string;
  role: string;
  symbol: string | null;
  decimals: number | null;
  name: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Circle's USDC uses 6 decimals everywhere; a USDC-named token with other decimals is a copy. */
const KNOWN_DECIMALS: Record<string, number> = { usdc: 6, usdt: 6, usdg: 6, pyusd: 6 };

export function guardToken(row: GuardRow, meta: TokenMetaRecord | undefined): string[] {
  const out: string[] = [];
  const sym = norm(meta?.symbol ?? row.symbol);
  const known = KNOWN_DECIMALS[sym];
  const dec = meta?.decimals ?? row.decimals;
  if (known !== undefined && dec !== null && dec !== known) out.push(`${meta?.symbol ?? row.symbol} with ${dec} decimals is a copy, the real one has ${known}`);
  if (sym === "usdc" && row.role === "stablecoin") out.push("No Circle-issued USDC is on the chain, so no USDC-named token may be mapped");
  if (!meta) return out;
  if (row.decimals !== null && meta.decimals !== null && row.decimals !== meta.decimals) out.push(`decimals ${meta.decimals} on Blockscout, ${row.decimals} in the source`);
  if (row.symbol && meta.symbol && norm(row.symbol) !== norm(meta.symbol)) out.push(`symbol ${meta.symbol} on Blockscout, ${row.symbol} in the source`);
  if (row.name && meta.name && !norm(meta.name).includes(norm(row.name)) && !norm(row.name).includes(norm(meta.name))) out.push(`name ${meta.name} on Blockscout, ${row.name} in the source`);
  const type = (meta.type ?? "").toUpperCase();
  if (isNftRole(row.role) && type === "ERC-20") out.push("mapped as an NFT collection but Blockscout reports ERC-20");
  if (isFungibleRole(row.role) && (type === "ERC-721" || type === "ERC-1155")) out.push(`mapped as a token but Blockscout reports ${type}`);
  return out;
}
