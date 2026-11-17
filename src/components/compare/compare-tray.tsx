"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/layout/container";
import { carriedQuery } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import { useCompare } from "@/lib/compare";

/** Fixed bottom bar holding up to four projects; the selection lives in the URL so it travels with the link. */
export function CompareTray() {
  const { projects, remove, clear } = useCompare();
  if (!projects.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/60 bg-ink-950/80 backdrop-blur-xl" role="region" aria-label="Compare tray" data-testid="compare-tray">
      <Container className="flex items-center gap-3 py-2">
        <span className="type-label hidden text-ink-300 sm:inline">Compare</span>
        <ul className="flex min-w-0 flex-1 gap-3 overflow-x-auto">
          {projects.map((p) => (
            <li key={p.id} className="inline-flex shrink-0 items-center gap-1 text-sm text-ink-50">
              {p.name}
              <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name} from compare`} className="rounded-md p-0.5 text-ink-300 hover:text-ink-50">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
        <CompareLink count={projects.length} />
      </Container>
    </div>
  );
}

/** Its own component so useSearchParams only runs once there is a selection, which the prerendered default view never has. */
function CompareLink({ count }: { count: number }) {
  const params = useSearchParams();
  return (
    <Button asChild variant="outline" size="sm" className="gap-1">
      <Link href={`/compare/${carriedQuery(params)}`}>
        Compare {count} <ArrowRight className="size-3.5" />
      </Link>
    </Button>
  );
}
