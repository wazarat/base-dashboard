import type { Metadata } from "next";
import { clean } from "./env";
import { isHiddenPath } from "./nav";

/**
 * Public site settings (docs/ATLAS-UI.md, section 12). Set NEXT_PUBLIC_SITE_URL
 * and NEXT_PUBLIC_SIBLING_ATLAS_URLS in .env.local and in the hosting project;
 * the planned domain is base.canhav.com.
 */
export function normalizeSiteUrl(v: string | undefined, fallback = "http://localhost:3100"): string {
  const t = (v ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/.test(t) ? t : fallback;
}

export function siblingUrl(v: string | undefined): string | null {
  return clean(v);
}

/** Comma-separated sibling atlas URLs (NEXT_PUBLIC_SIBLING_ATLAS_URLS); malformed entries are dropped. */
export function siblingUrls(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
}

/** Vercel sets this at build time; it keeps canonical URLs right on the interim host without hardcoding it anywhere. */
export function hostFallback(vercelProductionHost: string | undefined): string | undefined {
  const h = (vercelProductionHost ?? "").trim();
  return h ? `https://${h}` : undefined;
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || hostFallback(process.env.VERCEL_PROJECT_PRODUCTION_URL));
/** Sibling atlases for the footer. Defaults to the two live CanHav atlases so the footer is never empty. */
export const SIBLING_ATLAS_URLS = siblingUrls(process.env.NEXT_PUBLIC_SIBLING_ATLAS_URLS || "https://robinhood.canhav.com,https://near.canhav.com");

export const SITE = {
  name: "CanHav Research",
  chain: "Base",
  title: "CanHav Research, Base Ecosystem Atlas",
  template: "%s · Base Ecosystem Atlas",
} as const;

/** Shared Open Graph fields. Next replaces a page's nested openGraph object instead of merging it with the layout's, so every page spreads this. */
export const OG_BASE = {
  type: "website" as const,
  siteName: SITE.name,
  images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE.title }],
};

/** Per-page metadata: the title plus a canonical and Open Graph URL relative to metadataBase, with the shared Open Graph fields. */
export function pageMeta(title: string, path: string): Metadata {
  // A hidden tab (src/lib/nav.ts) stays reachable by its link but is not indexed.
  const hidden = isHiddenPath(path);
  return { title, alternates: { canonical: path }, openGraph: { ...OG_BASE, url: path, title: `${title} · Base Ecosystem Atlas` }, ...(hidden ? { robots: { index: false, follow: true } } : {}) };
}

/** Default timeline start; earlier events sit behind Show earlier events (docs/ATLAS-UI.md, section 8). */
export const TIMELINE_DEFAULT_START = "2025-01-01";
