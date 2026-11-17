import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InfoTip } from "./info-tip";

export interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  info: string;
  /** Full-precision value for the title attribute. */
  full?: string;
  /** Source named under the value, for example "DefiLlama". */
  source?: string;
  /** Coverage is zero: the value reads "Not tracked" at body weight and the card sits quieter. */
  quiet?: boolean;
  className?: string;
}

export function StatCard({ label, value, sub, info, full, source, quiet, className }: StatCardProps) {
  return (
    <Card className={cn("gap-0 px-4 py-3", quiet && "border-ink-700/40", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="type-label text-ink-300">{label}</span>
        <InfoTip label={`About ${label}`}>{info}</InfoTip>
      </div>
      <div className={cn("mt-1", quiet ? "text-base font-medium leading-8 text-ink-300" : "type-stat text-ink-50")} title={full}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-snug text-ink-300">{sub}</div>}
      {source && <div className="mt-0.5 text-[11px] leading-4 text-ink-300">{source}</div>}
    </Card>
  );
}
