/**
 * The page tabs, in order. A plain module so server routes (sitemap) and the client nav share one list.
 * A hidden tab keeps its route and its pages, so a direct link still works; it is left out of the
 * nav and the sitemap and asks search engines not to index it (owner request, 2026-11-09). Flip
 * `hidden` to bring a tab back.
 */
export const NAV_ALL = [
  { href: "/", label: "Overview", hidden: false },
  { href: "/sectors/", label: "Sectors", hidden: false },
  { href: "/traction/", label: "Traction", hidden: false },
  { href: "/funding/", label: "Funding", hidden: false },
  { href: "/security/", label: "Security", hidden: true },
  { href: "/investors/", label: "Investors", hidden: true },
  { href: "/explorer/", label: "Explorer", hidden: false },
  { href: "/compare/", label: "Compare", hidden: false },
] as const;

/** The tabs shown in the header and listed in the sitemap. */
export const NAV = NAV_ALL.filter((n) => !n.hidden);

export function isHiddenPath(path: string): boolean {
  return NAV_ALL.some((n) => n.hidden && n.href === path);
}

/** The hidden tabs, one list (owner prompt, login wall phase 1). Their pages, routes, data jobs and components stay. */
export const HIDDEN_TABS = NAV_ALL.filter((n) => n.hidden).map((n) => n.href);
