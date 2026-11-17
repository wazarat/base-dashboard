import { projects } from "./data";

/** Named comparison sets from the brief; resolved by project name, missing names skipped. */
export const COMPARE_PRESETS: Array<{ name: string; projects: string[] }> = [
  { name: "DEXs", projects: ["Aerodrome Finance", "Uniswap", "PancakeSwap", "Curve"] },
  { name: "Lending", projects: ["Morpho", "Aave", "Spark", "Moonwell"] },
  { name: "Launchpads", projects: ["Clanker", "Zora", "Flaunch", "Virtuals Protocol"] },
  { name: "Prediction markets", projects: ["Limitless", "Sport.fun", "Trueo"] },
];

const byName = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]));

export function resolvePreset(names: string[], lookup: Map<string, string> = byName): string[] {
  return names.map((n) => lookup.get(n.toLowerCase())).filter((id): id is string => Boolean(id));
}

/** Presets with at least two resolvable projects. */
export function availablePresets(lookup?: Map<string, string>) {
  return COMPARE_PRESETS.map((p) => ({ name: p.name, ids: resolvePreset(p.projects, lookup) })).filter((p) => p.ids.length >= 2);
}
