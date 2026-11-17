import { fmtPctSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Signed percent change with a direction glyph, so colour is never the only cue. */
export function ChangeCell({ value, digits = 1, className, label }: { value: number | null | undefined; digits?: number; className?: string; label?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("type-mono text-ink-300", className)}>no history</span>;
  const pct = value * 100;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const text = fmtPctSigned(value, digits);
  return (
    <span
      className={cn("type-mono inline-flex items-center gap-0.5 whitespace-nowrap", flat ? "text-ink-300" : up ? "text-signal-400" : "text-rose-400", className)}
      aria-label={`${label ? `${label} ` : ""}${flat ? "flat" : up ? "up" : "down"} ${Math.abs(pct).toFixed(digits)} percent`}
    >
      <span aria-hidden="true" className="text-[9px]">
        {flat ? "·" : up ? "▲" : "▼"}
      </span>
      {text}
    </span>
  );
}
