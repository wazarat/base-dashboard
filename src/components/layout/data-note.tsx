import { InfoTip } from "@/components/atlas/info-tip";
import { meta } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  defillama: "DefiLlama",
  blockscout: "Blockscout stats",
  growthepie: "growthepie",
  morpho: "Morpho",
  geckoterminal: "GeckoTerminal",
  "blockscout-keyed": "Blockscout (keyed)",
};

/** Footer line saying when the data was refreshed, with per-source status behind an info icon. */
export function DataNote() {
  const live = meta.live;
  const sources = live ? Object.entries(live.perSource) : [];
  const failing = sources.filter(([, s]) => !s.ok && !s.skipped).length;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="type-label text-ink-300">{live ? `Data as of ${meta.asOfLabel}, updated daily` : `Data as of ${meta.asOfLabel}, research snapshot`}</span>
        <InfoTip title="Sources on the last refresh" label="About the data date">
          {live ? (
            <div className="space-y-2">
              <p>
                Daily numbers cover complete UTC days up to {meta.asOfLabel}. The research snapshot (sectors, funding, security) is from {meta.snapshotAsOfLabel}.
              </p>
              <ul className="space-y-0.5">
                {sources.map(([id, s]) => (
                  <li key={id} className="flex justify-between gap-3">
                    <span>{SOURCE_LABEL[id] ?? id}</span>
                    <span className={cn("tabular", !s.ok && !s.skipped ? "text-rose-400" : "text-ink-300")}>
                      {s.skipped ? "skipped" : s.ok ? (s.lastSuccess ? `ok ${fmtDate(s.lastSuccess.slice(0, 10))}` : "not run yet") : "failed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Traction metrics pulled from the DefiLlama API on this date. No daily history is loaded in this build.</p>
          )}
        </InfoTip>
      </div>
      {failing > 0 && (
        <p className="type-label text-rose-400">
          {failing} {failing === 1 ? "source" : "sources"} failed on the last refresh
        </p>
      )}
    </div>
  );
}
