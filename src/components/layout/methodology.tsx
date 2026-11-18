import { COVERAGE_TERMS } from "@/lib/coverage";
import { meta, projects } from "@/lib/data";
import { fmtUsdFull } from "@/lib/format";
import { TRACTION_SOURCE_LINES } from "@/lib/traction";
import { SOURCE_GAP_FAIL } from "@/lib/accuracy";
import { METRIC_DEFS, SECTOR_CONFIGS, STALE_AFTER_DAYS } from "@/lib/sector-metrics";
import { SIGNAL_GAP, SIGNAL_MAX_AGE_DAYS } from "@/lib/signal-check";
import { TIER_HEADLINE_LINE, TIER_ONCHAIN_LINE } from "@/lib/tier";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="type-title text-ink-50">{title}</h2>
      <div className="type-body space-y-2 text-ink-300">{children}</div>
    </section>
  );
}

/** The methodology page. Figures that used to be typed in are computed from the generated data. */
export function Methodology() {
  // Build counts: the per-project funding and security facts are gated (login wall phase 2).
  const fundingChecked = meta.research.fundingChecked;
  const securityChecked = meta.research.securityResearched;
  const fundingScope = fundingChecked === projects.length ? `all ${projects.length}` : `${fundingChecked} of ${projects.length}`;
  return (
    <article className="max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="type-title-lg text-ink-50">Methodology</h1>
        <p className="type-body text-ink-300">How the Atlas is assembled, what each coverage word means and where every number comes from.</p>
      </header>

      <Block title="Coverage terms">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
          {COVERAGE_TERMS.map((t) => (
            <div key={t.term} className="contents">
              <dt className="type-label text-ink-300">{t.term}</dt>
              <dd>{t.meaning}</dd>
            </div>
          ))}
        </dl>
        <p>
          Funding checked for {fundingScope} projects. Security researched for {securityChecked} priority projects.
        </p>
      </Block>

      <Block title="Universe">
        <p>
          {meta.counts.projects} projects across {meta.counts.sectors} sectors, assembled from the Base official directory, DefiLlama listings with a Base adapter, Base Batches cohorts, and news, docs and directories. Every row carries the URL it was found at. Rows tagged as prior knowledge, and rows whose native chain was set with low confidence, show an Unverified note.
        </p>
      </Block>

      <Block title="Traction">
        <p>
          TVL, 30-day DEX volume, 30-day fees and 30-day revenue come from the DefiLlama API.{" "}
          {meta.live
            ? `${meta.counts.liveProjects} projects refresh daily from DefiLlama's history (window ending ${meta.asOfLabel}); the rest keep the ${meta.snapshotAsOfLabel} research snapshot.`
            : `Pulled ${meta.asOfLabel}.`}{" "}
          Blank cells mean DefiLlama lists no figure. They are treated as Not tracked, never as zero.
        </p>
        <p>
          Tiers are recomputed from the latest figures. Tier 1 means TVL at or above $50M, 30-day volume at or above $500M, or 30-day fees at or above $1M. Tier 2 means TVL at or above $2M, volume at or above $50M, or fees at or above $100K. {TIER_ONCHAIN_LINE}
        </p>
        <p>A project has traction when any one of these holds.</p>
        <ul className="list-disc space-y-1 pl-5">
          {TRACTION_SOURCE_LINES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>Stablecoin supply comes from DefiLlama&rsquo;s stablecoin data for Base, token volume, liquidity and holder counts from GeckoTerminal on the base network only. Transfer counts are not tracked, since Blockscout needs a paid plan for Base. Token addresses are mapped only from the issuer&rsquo;s own docs or site, DefiLlama or the project&rsquo;s own channels, never by name, and every build checks each address&rsquo;s name and decimals against its source. These figures stay apart from TVL, volume, fees and revenue, so nothing is counted twice.</p>
      </Block>

      <Block title="Sector metrics">
        <p>
          Each sector has its own metrics. A project page shows only the ones that apply to its sector, so a lending market has no DEX volume row. The first metric listed is the sector&rsquo;s headline, which ranks the sector leaders and feeds the tier. {TIER_HEADLINE_LINE}
        </p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[14rem_1fr]">
          {SECTOR_CONFIGS.filter((c) => c.measured).map((c) => (
            <div key={c.sector} className="contents">
              <dt className="font-medium text-ink-50">{c.sector}</dt>
              <dd>{c.metrics.map((id) => METRIC_DEFS[id].label).join(", ")}</dd>
            </div>
          ))}
        </dl>
        <p>
          {SECTOR_CONFIGS.filter((c) => !c.measured).map((c) => c.sector).join("; ")} have no traction metric and no tier. Their work runs offchain, or their onchain figures, such as exchange wallet balances and token locker balances, are not traction. They are ranked by the curated sector leaders file.
        </p>
        <p>Every cell is one of three things. A value. Zero by design, where the source itself says the figure is zero on purpose, shown as $0 with the source&rsquo;s sentence. Or Not tracked, where the metric applies but no free source covers the project yet. A metric that does not exist for a kind of project is left off the page.</p>
        <p>
          Lending pages show Total deposited, Borrowed and TVL side by side, because they measure different things and are all true at once. Total deposited is collateral plus lending supply. DefiLlama&rsquo;s TVL subtracts money that is lent out. For Morpho the figures come from the Morpho API, and for other lenders from DefiLlama TVL plus its borrowed figure.
        </p>
        <p>
          Accuracy rules. Each number has one primary source, and where a second source reports the same figure the build logs the gap and stops if a headline differs by more than {SOURCE_GAP_FAIL * 100}%. Every figure states the day it covers, and anything more than {STALE_AFTER_DAYS} days old is shown with its date instead of as current. Every Other signal carries a date, the one written in it or else the day of the dataset snapshot, and a signal that differs from the live metric of the same kind by more than {SIGNAL_GAP * 100}% and is older than {SIGNAL_MAX_AGE_DAYS} days is tucked behind Older figure.
        </p>
      </Block>

      <Block title="History and momentum">
        <p>
          Daily series are stored in the repo and appended by a scheduled job. 7-day, 30-day and 90-day change compares each window with the one before it (TVL compares end values). Projects with several DefiLlama listings are summed; the mapping is in data/defillama-map.csv. Chain-level series also use the Blockscout stats service.
        </p>
      </Block>

      <Block title="TVL overlap">
        <p>Overview totals follow DefiLlama&rsquo;s chain totals. With no filters the cards show DefiLlama&rsquo;s own figures; any sum across projects counts only what DefiLlama counts in its chain total, so double-counted apps (for example Steakhouse Financial, which curates a Morpho vault), exchange deposits and token lockers are left out. Every build checks these sums against DefiLlama&rsquo;s chain series and fails if they differ by more than 1%.</p>
      </Block>

      <Block title="Funding and security">
        <p>
          Funding checked for {fundingScope} projects and security researched for {securityChecked}. Not researched means the field was never checked. Not disclosed means funding was checked and nothing was found. For hackathon entries and small native projects, Not disclosed means winner lists, project pages and a search found nothing. Security findings are listed as facts with their sources, never as a rating.
        </p>
      </Block>

      <Block title="Chain activity">
        <p>
          Daily active addresses, transactions and smart-wallet counts come from growthepie and DefiLlama, since the Blockscout stats service is not published for Base. Per-project activity counts transactions to each project&apos;s tracked contracts (data/contracts.csv, mostly token contracts) through Blockscout&apos;s keyed API. Unique senders are summed per day from sampled transactions and are an estimate.
        </p>
      </Block>

      <Block title="Financials and rounds">
        <p>
          Fee splits (supply-side, protocol, holders) are DefiLlama&apos;s. Incentives and emissions are not included (paid source). Funding rounds are hand-collected; rows tagged re-verify come from prior knowledge rather than a linked source.
        </p>
      </Block>

      <Block title="Confidence">
        <p>Some sources are self-reported or low confidence. Native-chain classification carries its own confidence flag, and every project drawer lists its sources.</p>
      </Block>

      <Block title="Totals in this build">
        <p>
          TVL {fmtUsdFull(meta.totals.tvl)}, 30d volume {fmtUsdFull(meta.totals.volume)}, 30d fees {fmtUsdFull(meta.totals.fees)}, 30d revenue {fmtUsdFull(meta.totals.revenue)}.
        </p>
      </Block>
    </article>
  );
}
