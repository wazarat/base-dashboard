/**
 * Explorer sort in the URL (?xs=tvl.desc). With no param the table sorts by
 * TVL, highest first and blanks last, then 30d volume descending, then name.
 */
export interface SortEntry {
  id: string;
  desc: boolean;
}

export const DEFAULT_EXPLORER_SORT: SortEntry[] = [
  { id: "tvl", desc: true },
  { id: "volume", desc: true },
  { id: "name", desc: false },
];

export function parseSort(v: string | null | undefined): SortEntry[] {
  if (!v) return DEFAULT_EXPLORER_SORT;
  const out = v
    .split(",")
    .map((part) => {
      const [id, dir] = part.split(".");
      return id ? { id, desc: dir === "desc" } : null;
    })
    .filter((x): x is SortEntry => x !== null);
  return out.length ? out : DEFAULT_EXPLORER_SORT;
}

/** Null for the default, so the URL stays clean. */
export function serializeSort(s: SortEntry[]): string | null {
  if (!s.length) return null;
  const v = s.map((e) => `${e.id}.${e.desc ? "desc" : "asc"}`).join(",");
  return v === serializeDefault ? null : v;
}

const serializeDefault = DEFAULT_EXPLORER_SORT.map((e) => `${e.id}.${e.desc ? "desc" : "asc"}`).join(",");
