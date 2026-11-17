# Base Ecosystem Atlas

Interactive research dashboard over 1,038 projects in the Base ecosystem, in 22 sectors: where traction, money and risk sit, and how it changes day by day. Independent research by CanHav Research, not affiliated with Base or Coinbase.

It is the third CanHav atlas, after robinhood.canhav.com and near.canhav.com, and follows the shared UI contract in `docs/ATLAS-UI.md`. Planned domain is base.canhav.com.

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui restyled with the CanHav tokens, Recharts, TanStack Table, Papa Parse and nuqs. Vercel serves the app natively, so gated data stays server-side. All fetching happens in scripts and the scheduled job, never in the browser.

## Run it

```bash
npm install
npm run dev          # builds the data from data/ (and data/history once it exists), then starts next dev
npm run build        # builds and validates the data, then next build
npm test             # unit tests on saved fixtures, never live calls
npm run lint
npm run check:copy   # copy rules from docs/ATLAS-UI.md, no colons or em dashes in UI strings
npm run screenshots  # Playwright, every page at 1440 and 390 px in dark and light
npm run review       # print Tally submissions next to the current CSV rows
```

Copy `.env.example` to `.env.local` for the optional keys. Nothing is required to build. With no keys the app builds and runs with the login wall off and the keyed fetchers skipped.

## How the data fits together

The ecosystem CSV is the source of truth for who is listed. Live data only adds metrics. New DefiLlama or GeckoTerminal finds go to a "Newly detected" review list and are never added automatically.

```
data/
  base-ecosystem-2026-11-17.csv                   1,038 projects, 29 columns
  base-funding-rounds-2026-11-17.csv              406 rounds, 89 Base related
  base-defillama-map-2026-11-17.csv               452-row seed map to DefiLlama ids and slugs
  base-defillama-adapters-to-verify-2026-11-17.csv  444 unclassified adapter slugs with a Base key
  base-events-*.csv                               dated events for the timeline
  base-sector-leaders-*.csv                       curated leaders for the unmeasured sectors
  analyst-notes.md                                the Analyst notes on the Overview
  expected.json                                   snapshot validation, exact counts and sums
docs/
  ATLAS-UI.md                                     shared UI contract, wins on look and behaviour
  reference/robinhood-sector-metrics-spec.md      pattern for the sector metrics
  research/                                       the three research memos
```

`npm run data` (also run before `dev` and `build`) reads only committed files and fails the build on any difference from `data/expected.json`, an unresolved funding round, or a gated field in the public set.

Until the daily history exists the KPIs sum the Nov 17 research snapshot, leaving out vault curators, capital allocators, liquid staking, token lockers, exchange wallets and payment volume, so nothing is counted twice. DefiLlama's chain figures replace this once the refresh runs.

## History store and the daily refresh

```
data/history/
  _meta.json             last run, per-source status, newly detected protocols
  chain.json             DefiLlama chain series (TVL, double counted, volume, fees, revenue, active users)
  growthepie.json        chain activity (active addresses, transactions, smart wallets over 7 days)
  defillama/             per-protocol TVL, volume, fees, revenue series, flags (protocols.json), adapter checks
  morpho/                markets (broken ones flagged) and vaults
  stablecoins/, yields/, gecko/   sector inputs
```

The store is append-only by date. Each run re-fetches the trailing 7 days and overwrites them, so DefiLlama's revisions land, and a stable JSON writer means a rerun with no new data writes the same bytes.

- `npm run refresh` fetches the latest days from every source. Flags are `--backfill` (full history), `--only a,b` (named sources), `--strict` (fail on any source error) and `--dry-run` (write nothing).
- A source that fails keeps its last good data, records the error in `_meta.json`, and the run carries on. A missing secret skips its source.
- `.github/workflows/refresh.yml` runs daily at 04:37 UTC and on demand (with a `backfill` input), then builds, tests and commits `data/history` as `data: refresh YYYY-MM-DD` under the owner's name and the `GIT_AUTHOR_EMAIL` repository variable.
- To rerun a backfill, use Run workflow on the Actions tab with backfill ticked, or `npm run refresh -- --backfill` locally and commit `data/history`.
- After changing a TVL flag rule in `src/lib/flags.ts`, `npx tsx scripts/reflag.ts` re-applies it to the stored protocol list without fetching.

The build reconciles the counted projects against DefiLlama's chain totals for TVL, double-counted TVL, 30-day volume, fees and revenue, and fails on a gap above 1%, printing the top 10 contributors.

## Data sources and their free limits

| Source | Used for | Limits |
|---|---|---|
| DefiLlama `api.llama.fi` | Per-protocol TVL with borrowed, staking, pool2 and vesting, chain TVL, DEX volume, fees and revenue overviews, aggregators, bridge aggregators, open interest, options, active users, hacks | No key, one request a second |
| DefiLlama stablecoins and yields | Stablecoin supply on Base per coin, yield pools and lending rates | No key |
| Morpho GraphQL `api.morpho.org/graphql` | Markets and vaults on chain 8453 | No key. Markets with an absurd APY or unpriced collateral are dropped and logged |
| GeckoTerminal `api.geckoterminal.com` | Launchpad and agent venue pools, token volume, liquidity and holders | No key, about one call every 7 seconds in practice |
| Blockscout gateway `api.blockscout.com/8453` | Token holders, supply and transfers | Free key (`BLOCKSCOUT_API_KEY`). The stats service is not published for Base |
| growthepie `api.growthepie.com` | Daily active addresses, transactions and smart-wallet activity | No key |

### Deferred (paid)

These return HTTP 402 or need a paid plan and are not used.

- DefiLlama `/raises`, `/emissions`, `/overview/derivatives` (perps volume), `/summary/derivatives/*`, `/oracles`, `/chainAssets`, and `bridges.llama.fi`
- GeckoTerminal category endpoints
- Dune API, Token Terminal, Artemis, Nansen, RootData, CryptoRank, Flipside and the X API

## Deployment

The Vercel project `base-dashboard` (team "Wazarat's projects") deploys `main` to production on every push. `NEXT_PUBLIC_SIBLING_ATLAS_URLS` is set there. The Tally form links and the Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, production only, from the same Clerk application as canhav.com) are set there too.

## Login wall

With the Clerk keys present the wall is on. Overview, Methodology and the footer pages are public. Sectors, Traction, Funding, Explorer and the hidden pages show a blurred preview with a "Log in for free access" pop-up, and Clerk opens in modal mode and returns the reader to the tab or action they clicked. Compare shows a comparison already in the URL, and Add to compare asks for a login. Gated data reaches the browser only from `/api/data/gated/` for a signed-in reader (401 otherwise, `Cache-Control: private`), and `scripts/check-public-bundle.mjs` fails the build if a gated investor name shows up in `.next/static` or the prerendered pages. Without keys the app builds and runs with the wall off and logs one warning.

Clerk production keys only answer on the Clerk application's own domain, so sign-in works once `base.canhav.com` points at this project. On the `*.vercel.app` host the wall shows but sign-in cannot complete. `NEXT_PUBLIC_SITE_URL` stays unset until the domain is pointed, so canonical URLs fall back to the Vercel production host.

## Pointing base.canhav.com at the Vercel project

1. In Vercel, open the project, then Settings, Domains, and add `base.canhav.com`.
2. At the DNS host for canhav.com, add the CNAME record Vercel shows (usually `cname.vercel-dns.com`) for `base`.
3. Set `NEXT_PUBLIC_SITE_URL=https://base.canhav.com` in the Vercel project and redeploy, so canonical URLs, Open Graph URLs and the sitemap use the domain.
