import type { ReactNode } from "react";

export function TooltipFrame({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-xs rounded-lg border border-ink-700/60 bg-ink-900 px-3 py-2 text-xs text-ink-50 shadow-popover">
      {title && <div className="mb-1 font-medium text-ink-50">{title}</div>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function TooltipRow({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-ink-300">
        {color && <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className="tabular font-medium text-ink-50">{value}</span>
    </div>
  );
}

/** Loose shape of what Recharts hands a custom tooltip content. */
export interface TipProps<T = unknown> {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: T; value?: number | string; name?: string | number; dataKey?: string | number; color?: string }>;
}
