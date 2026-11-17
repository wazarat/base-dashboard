"use client";

import { TIER_COLOR } from "@/lib/colors";
import { fmtUsd } from "@/lib/format";
import { SECTOR_CONFIGS } from "@/lib/sector-metrics";
import { TIER_HEADLINE_LINE, TIER_ONCHAIN_LINE, TIER_THRESHOLDS } from "@/lib/tier";
import { InfoTip } from "./info-tip";

const t1 = TIER_THRESHOLDS.tier1;
const t2 = TIER_THRESHOLDS.tier2;

/** One line per tier, built from src/lib/tier.ts so the explanation can never drift from the rule. */
export const TIER_LINES = [
  { tier: "Tier 1 - Leader" as const, name: "Tier 1, leader", rule: `TVL of ${fmtUsd(t1.tvl, { digits: 0 })} or more, or 30-day DEX volume of ${fmtUsd(t1.volume, { digits: 0 })} or more, or 30-day fees of ${fmtUsd(t1.fees, { digits: 0 })} or more.` },
  { tier: "Tier 2 - Strong" as const, name: "Tier 2, strong", rule: `TVL of ${fmtUsd(t2.tvl, { digits: 0 })} or more, or 30-day volume of ${fmtUsd(t2.volume, { digits: 0 })} or more, or 30-day fees of ${fmtUsd(t2.fees, { digits: 0 })} or more.` },
  { tier: "Tier 3 - Emerging" as const, name: "Tier 3, emerging", rule: "Any tracked TVL, volume, fees or revenue below Tier 2." },
];

/** Built from the registry, so the list of sectors with no tier can never drift from the rule. */
const UNMEASURED_LINE = `${SECTOR_CONFIGS.filter((c) => !c.measured && c.sector !== "Other").map((c) => c.sector).join("; ")} and Other carry no tier, because their work runs offchain or their onchain figures are not traction.`;

/** The tier explanation: an intro, one bullet per tier with its legend swatch, and an optional closing line. */
export function TierInfoContent({ closing = "Projects DefiLlama does not track are left out.", showTbd = true }: { closing?: string | null; showTbd?: boolean }) {
  return (
    <div className="space-y-2">
      <p>Projects per sector by traction tier. Tiers are CanHav&rsquo;s own thresholds, not a market standard. A project needs to meet only one condition.</p>
      <ul className="space-y-1.5">
        {TIER_LINES.map((t) => (
          <li key={t.tier} className="flex gap-2">
            <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TIER_COLOR[t.tier] }} />
            <span>
              <strong className="font-semibold text-ink-50">{t.name}.</strong> {t.rule}
            </span>
          </li>
        ))}
        {showTbd && (
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TIER_COLOR["Not tracked"] }} />
            <span>
              <strong className="font-semibold text-ink-50">TBD.</strong> DefiLlama does not track this project yet, so its tier is to be determined.
            </span>
          </li>
        )}
        {showTbd && (
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TIER_COLOR["Not applicable"] }} />
            <span>
              <strong className="font-semibold text-ink-50">Not applicable.</strong> {UNMEASURED_LINE}
            </span>
          </li>
        )}
      </ul>
      <p>{TIER_ONCHAIN_LINE}</p>
      <p>{TIER_HEADLINE_LINE}</p>
      {closing && <p>{closing}</p>}
    </div>
  );
}

/** The same explanation behind an info icon, for every place a tier is named (leaderboard header, project modal, Tier filter). */
export function TierInfoTip({ closing = null, className }: { closing?: string | null; className?: string }) {
  return (
    <InfoTip label="How tiers are set" className={className}>
      <TierInfoContent closing={closing} />
    </InfoTip>
  );
}
