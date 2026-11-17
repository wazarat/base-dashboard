"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Info icon that opens a small popover: click or Enter opens, Escape and an
 * outside click close. The home of every helper line longer than one sentence,
 * so labels and chips stay quiet. Built on Radix Popover, which handles focus
 * return and flips away from the viewport edge.
 */
export function InfoTip({
  title,
  children,
  label = "More about this",
  align = "start",
  side = "bottom",
  className,
}: {
  title?: string;
  children: ReactNode;
  /** Accessible name of the icon button. */
  label?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md align-middle text-ink-300 transition-colors hover:bg-ink-800/60 hover:text-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60",
            className,
          )}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="info-tip"
        align={align}
        side={side}
        collisionPadding={16}
        onClick={(e) => e.stopPropagation()}
        className="w-72 max-w-[calc(100vw-2rem)] gap-1 rounded-lg border border-ink-700/60 bg-ink-900 p-3 text-xs font-normal leading-relaxed text-ink-300 shadow-popover"
      >
        {title && <span className="block font-medium text-ink-50">{title}</span>}
        <div>{children}</div>
      </PopoverContent>
    </Popover>
  );
}
