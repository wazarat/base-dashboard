import type { ReactNode } from "react";
import { CHAIN_SHORT, TIER_SHORT } from "@/lib/colors";
import type { NativeChain, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Plain-text label at `label` size in ink-300, with an optional mono proof in
 * ink-500 after it. Replaces every badge, chip and pill. Colour appears only
 * through `tone`, for a value that went up or met a bar (signal) or went down
 * or failed (rose).
 */
export function PlainLabel({
  children,
  proof,
  tone,
  className,
  title,
}: {
  children: ReactNode;
  proof?: ReactNode;
  tone?: "up" | "down";
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn("type-label inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-ink-300", tone === "up" && "text-signal-400", tone === "down" && "text-rose-400", className)}
      title={title}
    >
      <span>{children}</span>
      {proof !== undefined && proof !== null && proof !== "" && <span className="type-mono text-ink-300">{proof}</span>}
    </span>
  );
}

export function tierText(tier: Tier): string {
  return TIER_SHORT[tier];
}

/** Full chain name by default; the short form for dense tables. */
export function chainText(chain: NativeChain, short = false): string {
  return short ? CHAIN_SHORT[chain] : chain;
}
