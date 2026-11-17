/**
 * Roles in data/contracts.csv. Each mapped address must come from the issuer's docs or site,
 * a DefiLlama listing, or the project's own channels, never from a name or symbol search.
 */
export const CONTRACT_ROLES = ["stablecoin", "project-token", "rwa-token", "nft-collection", "contract"] as const;
export type ContractRole = (typeof CONTRACT_ROLES)[number];

/** Fungible tokens whose holders and supply are tracked. "token" is the pre-2026-11-09 spelling of project-token. */
export function isFungibleRole(role: string): boolean {
  return role === "stablecoin" || role === "project-token" || role === "rwa-token" || role === "token";
}

export function isNftRole(role: string): boolean {
  return role === "nft-collection" || role === "nft";
}

/** Project tokens trade on DEXs, so their pools give a 30-day volume. */
export function isDexTradedRole(role: string): boolean {
  return role === "project-token" || role === "token";
}
