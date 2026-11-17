"use client";

import { usePathname } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { useAccess } from "@/lib/access";
import { projectById } from "@/lib/data";
import { authOf, FILTER_KEYS, trackFilterUse, trackProjectOpen, trackTabView } from "@/lib/track";

/**
 * Page-level analytics events from the URL (src/lib/track.ts): a tab view per page, a project open whenever
 * `project` points at a new project (a shared link included), and a filter use the first time a reader changes
 * each filter on a page. Values a link arrived with are not counted as filter use.
 *
 * The URL is read through nuqs, not useSearchParams: the shell also renders as the prerendered fallback
 * (prerendered-shell.tsx), where nuqs reads defaults and useSearchParams would fail the static build.
 */
const URL_KEYS = Object.fromEntries([...FILTER_KEYS, "project"].map((k) => [k, parseAsString]));
export function AnalyticsEvents() {
  const access = useAccess();
  const pathname = usePathname();
  const [params] = useQueryStates(URL_KEYS);
  const auth = authOf(access);
  const ready = access.loaded;

  // tab_view, once auth is known.
  useEffect(() => {
    if (ready) trackTabView(pathname, auth);
    // Only a new page counts, not a later change of auth on the same page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, ready]);

  // project_open
  const project = params.project;
  useEffect(() => {
    if (!ready || !project) return;
    const p = projectById(project);
    if (p) trackProjectOpen(p.sector, auth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, ready]);

  // filter_use: compare each filter with the values the page started with; count each filter once per page view.
  const baseline = useRef<{ path: string; values: Map<string, string>; used: Set<string> } | null>(null);
  const filterValues = FILTER_KEYS.map((k) => params[k] ?? "").join("|");
  useEffect(() => {
    const now = new Map<string, string>(FILTER_KEYS.map((k) => [k, params[k] ?? ""]));
    const b = baseline.current;
    if (!b || b.path !== pathname) {
      baseline.current = { path: pathname, values: now, used: new Set() };
      return;
    }
    for (const k of FILTER_KEYS) {
      if (now.get(k) !== b.values.get(k) && !b.used.has(k)) {
        b.used.add(k);
        trackFilterUse(k, pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, filterValues]);

  return null;
}
