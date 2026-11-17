import { ExternalLink } from "lucide-react";
import { fmtDateShort } from "@/lib/format";
import type { OnchainMetrics } from "@/lib/onchain";
import { signalSentence } from "@/lib/onchain-text";

/** The onchain metric behind a project's traction, with its direct sources and as-of date. Every word is generated from the data. */
export function OnchainLines({ o, max = 3, className }: { o: OnchainMetrics; max?: number; className?: string }) {
  const shown = o.signals.slice(0, max);
  if (!shown.length) return null;
  return (
    <ul className={className ?? "space-y-1"} data-testid="onchain-lines">
      {shown.map((s) => (
        <li key={`${s.kind}-${s.address ?? s.symbol}`} className="text-sm">
          <span className="text-ink-50">{signalSentence(s)}</span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-x-2 text-xs text-ink-300">
            {s.sources.map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-ink-50 hover:underline">
                {src.label} <ExternalLink className="size-3" />
              </a>
            ))}
            <span>as of {fmtDateShort(o.asOf)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
