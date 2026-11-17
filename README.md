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

## Pointing base.canhav.com at the Vercel project

1. In Vercel, open the project, then Settings, Domains, and add `base.canhav.com`.
2. At the DNS host for canhav.com, add the CNAME record Vercel shows (usually `cname.vercel-dns.com`) for `base`.
3. Set `NEXT_PUBLIC_SITE_URL=https://base.canhav.com` in the Vercel project and redeploy, so canonical URLs, Open Graph URLs and the sitemap use the domain.
