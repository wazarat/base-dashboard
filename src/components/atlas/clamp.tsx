"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** True when the clamped box hides content; the one-pixel slack absorbs subpixel line heights. */
export function shouldShowToggle(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + 1;
}

const LINES: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

/**
 * Long text that wraps, clamps at `lines` and shows a "Show more" control only
 * when something is hidden (docs/ATLAS-UI.md, section 11).
 */
export function Clamp({ lines = 3, children, className }: { lines?: 1 | 2 | 3 | 4 | 5 | 6; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClamped(shouldShowToggle(el.scrollHeight, el.clientHeight));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);

  return (
    <div className={cn("min-w-0", className)}>
      <div ref={ref} className={cn("break-words", !open && LINES[lines])}>
        {children}
      </div>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="type-label mt-0.5 text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
