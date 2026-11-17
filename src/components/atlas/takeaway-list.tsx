import type { Takeaway } from "@/lib/takeaways";
import { cn } from "@/lib/utils";

export type { Takeaway };

export function hasTakeaway(t: Takeaway | null | undefined): t is Takeaway {
  return Boolean(t && (t.points.length || t.table?.rows.length));
}

/**
 * The takeaway in a card's expanded view (owner request, 2026-11-10): a metric table over
 * 7, 30 and 90 days for time-based cards, and short dateless points for the rest.
 */
export function TakeawayList({ takeaway, className }: { takeaway: Takeaway; className?: string }) {
  const t = takeaway.table;
  return (
    <div className={cn("type-body space-y-2 text-ink-300", className)} data-testid="takeaway">
      {/* The lead keeps its colon, the one exception to the no-colon rule (owner decision, 2026-11-10). */}
      {takeaway.lead && <p>{`${takeaway.lead}:`}</p> /* copy-ok */}
      {t && t.rows.length > 0 && (
        <table className="w-full max-w-3xl text-sm" data-testid="takeaway-table">
          <thead>
            <tr className="border-b border-ink-700/40 text-left">
              <th scope="col" className="type-label py-1.5 pr-4 font-normal text-ink-300">
                Metric
              </th>
              {t.columns.map((c) => (
                <th key={c} scope="col" className="type-label py-1.5 pl-4 text-right font-normal text-ink-300">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.label} className="border-b border-ink-700/20 last:border-0">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-300">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={t.columns[i]} className="tabular py-1.5 pl-4 text-right text-ink-50">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {takeaway.points.length > 0 && (
        <ul className="space-y-1">
          {takeaway.points.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-ink-400" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
