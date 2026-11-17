"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CARRIED_PARAMS } from "@/lib/filters";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export { NAV };

/** Keeps the shareable state (range, per-chart metrics, compare selection) when moving between pages. */
export function carriedQuery(params: URLSearchParams | null): string {
  if (!params) return "";
  const out = new URLSearchParams();
  for (const k of CARRIED_PARAMS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

function NavLinks({ query, compareCount = 0 }: { query: string; compareCount?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex h-10 items-stretch gap-1 xl:h-nav">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.replace(/\/$/, ""));
          return (
            <li key={item.href} className="flex shrink-0">
              <Link
                href={`${item.href}${query}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "type-control inline-flex items-center border-b-2 border-transparent px-3 text-ink-300 transition-colors hover:text-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-electric-500/60",
                  active && "border-electric-500 text-ink-50",
                )}
              >
                {item.label}
                {item.href === "/compare/" && compareCount > 0 && <span className="tabular ml-1 text-ink-300">{compareCount}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Rendered inside a Suspense boundary because it reads the query string. */
export function MainNav() {
  const params = useSearchParams();
  const compare = (params.get("compare") ?? "").split(",").filter(Boolean).length;
  return <NavLinks query={carriedQuery(params)} compareCount={compare} />;
}

export function MainNavFallback() {
  return <NavLinks query="" />;
}
