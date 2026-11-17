import { ExternalLink } from "lucide-react";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { chainRisk, type RiskLevelMark } from "@/data/chain-risk";
import { cn } from "@/lib/utils";

/** Status words only; colour sits on the word alone (docs/ATLAS-UI.md, section 10). */
const MARK: Record<RiskLevelMark, { className: string; label: string }> = {
  red: { className: "text-rose-400", label: "Open risk" },
  amber: { className: "text-ink-300", label: "Partial" },
  green: { className: "text-signal-400", label: "Mitigated" },
};

export function ChainChecklist({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <h3 className="type-card-title text-ink-50">Chain-level risk</h3>
        <FilteredNote scope="chain" className="block" />
        <p className="text-sm text-ink-300">Base as a rollup, from ETHBEAT (formerly L2BEAT) and incident reports.</p>
        <ul className="type-label mt-1 flex gap-3" aria-label="Status words">
          {(["red", "amber", "green"] as const).map((k) => (
            <li key={k} className={MARK[k].className}>
              {MARK[k].label}
            </li>
          ))}
        </ul>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-ink-700/40">
          {chainRisk.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-ink-50">{item.label}</div>
                <p className="text-xs text-ink-300">{item.detail}</p>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline">
                  {item.sourceLabel} <ExternalLink className="size-3" />
                </a>
              </div>
              <span className={cn("type-label shrink-0", MARK[item.level].className)}>{MARK[item.level].label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
