# Sector metrics spec (Robinhood Chain Atlas)

What each sector's project pop-up and sector leaders view should show, where the data comes from, whether it is free, and how hard it is. All sources below were tested live against Robinhood Chain on Nov 10, 2026. A Claude Code prompt is at the end.

## 0. Accuracy rules

**Morpho check, Nov 10.** The numbers agree once each is labelled correctly.

| Measure | Value | Source |
|---|---|---|
| Lending supply | $524M across 534 markets | Morpho API |
| Borrowed | $474M (Morpho API), $471M (DefiLlama) | Both |
| Collateral posted | $538M | Morpho API |
| Total deposited (collateral plus lending supply) | about $1.06B | Computed |
| TVL (deposits minus borrowed) | $604M on DefiLlama, about $588M computed | DefiLlama |

So "$1B+ deposited" and "$600M TVL" are both true. They measure different things. DefiLlama's lending TVL subtracts money that is lent out, so lending projects must show Total deposited, Borrowed and TVL side by side, each with a one-line definition.

**Rules that apply to every project.**
1. **Other signals carry a date and are checked.** Every Other Traction Signal shows its as-of date. A build check compares any dollar figure in it with the live metric of the same kind. If they differ by more than 25% and the signal is older than 30 days, hide it behind "Older figure" and log it for review.
2. **Definitions on every number.** Each metric's InfoTip states what it counts and what it excludes, for example "TVL excludes borrowed funds".
3. **One source per number.** When two sources disagree (Morpho API against DefiLlama), show the primary one and log the gap. Fail the build if the gap is over 10% for headline metrics.
4. **Dates.** Every value states its as-of day. Nothing older than 3 days is shown as current.

## 1. Rules for every sector

**Three labels, never mixed up.**
- **Not applicable.** The metric does not exist for this kind of project, for example DEX volume for a lending market. Hide the row instead of showing it.
- **$0 by design.** The source reports zero on purpose, for example Morpho's protocol revenue, since Morpho takes no fee. Show "$0" plus a short reason in the InfoTip.
- **Not tracked.** The metric applies but no free source covers this project yet.

**Two layers in every project pop-up.**
- **Universal block, every project.** Sector and subcategory, native chain, status, tier, funding, sources.
- **Sector block.** The metrics in the sector's table below, in that order. The first metric is the sector's headline. It drives the sector leaders ranking and the tier.

**Two kinds of sector.**
- **Measured sectors.** These have a headline traction metric and tiers. They are DEXs and Liquidity, Launchpads, AI Agents, NFTs Gaming and Collectibles, Lending and Credit, Yield and Asset Management, RWA and Tokenized Stocks, Trading Tools and Bots, Perps Options and Derivatives, Memecoins and Community, Bridges and Interoperability, Stablecoins and Payments, and Prediction Markets.
- **Unmeasured sectors.** These show no traction metric and no tier anywhere. They are Security Risk and Compliance, Data and Analytics, Wallets and Custody, Infrastructure and Dev Tools, Exchanges and On/Off-Ramps, and Other.
  - Their services run offchain, or their onchain figures (CEX wallet balances, locker balances) are not traction.
  - The project pop-up shows their facts (supported since, audits done, assets held on the chain) without a Traction heading.
  - They are left out of tier charts and the Traction leaderboard.
  - Their tier reads "Not applicable", never TBD.
  - Their leaders are ranked by the curated sector leaders file.

## 1b. Sector cards (Sectors tab)
Replace the current cards. Remove the "With traction" stat, its bar, its InfoTip and the "Mostly offchain services" line from every card.

- **Top row, two stats.** Projects, and Robinhood native written as a count with its share, for example "45 (53%)". Rename "Native share" to "Robinhood native" everywhere.
- **Divider, then Sector leaders.** The top 3 projects, one per row.
  - Each row shows the name and, for measured sectors, the headline metric with its label, for example "Uniswap  $16.9B 30d volume" or "Morpho  $1.06B deposited".
  - Unmeasured sectors show a short role instead, for example "Chainalysis  Compliance and investigations".
  - Clicking a name opens the project pop-up. Clicking the sector title opens the full ranked leaders.
- **Ranking.** Measured sectors rank by the headline metric, using only `inChainTotal` or flagged values, with no double counting. Unmeasured sectors use the curated rank.
- **Layout.** Equal card heights per row and right-aligned numbers. No colons or em dashes in copy.

**Effort key.** S means data the pipeline already fetches, just shown differently. M means a new free endpoint with no per-project mapping. L means it needs a per-project token or contract address mapped by hand.

## 2. Free sources confirmed live (Nov 10)

| Source | What it gives on Robinhood Chain | Status |
|---|---|---|
| DefiLlama `/protocols` and `/protocol/{slug}` | TVL plus `Robinhood Chain-borrowed`, `-staking`, `-pool2` and `-vesting` per protocol. 311 protocols list the chain. Morpho shows $604M TVL and $471M borrowed. | Free, already used |
| DefiLlama `/overview/fees` with `dataType` | Fees, revenue, holders revenue, supply-side revenue. 165 protocols have holders revenue. | Free, partly used |
| DefiLlama `/overview/aggregators/Robinhood%20Chain` | DEX aggregator volume, 48 protocols, $1.81B over 30 days (0x $408M, Uniswap aggregator $280M, Rialto $249M, KyberSwap $248M) | Free, new |
| DefiLlama `/overview/bridge-aggregators/Robinhood%20Chain` | Bridge aggregator volume, 15 protocols, $300M over 30 days (0x $159M, LI.FI $101M, Jumper $59M) | Free, new |
| DefiLlama `/overview/open-interest/Robinhood%20Chain` | Perps open interest. Lighter Robinhood Perps $191M, Arcus $106M on Nov 9. | Free, new |
| DefiLlama `/overview/options/Robinhood%20Chain` | Options notional and premium, 5 protocols, tiny so far | Free, new |
| DefiLlama `/overview/active-users/Robinhood%20Chain` | Daily users for 11 protocols | Free, used |
| DefiLlama `/hacks` | 1,345 incidents with chain, amount and technique | Free, new |
| DefiLlama yields `yields.llama.fi/pools` and `/lendBorrow` | 81 Robinhood Chain pools with TVL and APY (base and reward), plus lending supply and borrow APY, total supplied and borrowed, LTV | Free, new |
| DefiLlama stablecoins | Supply per coin on the chain (USDG, USDe, U) | Free, in the traction prompt |
| Morpho GraphQL `api.morpho.org/graphql`, chainId 4663 | Per market supply, borrow, utilization and APYs, plus vaults' assets and net APY. The top market USDG lent against USDe has $359M supplied at 90% utilization. | Free, no key, new |
| GeckoTerminal `/networks/robinhood/...` | 52 DEXes including launchpad venues (Pons, Clanker, Bankr, Virtuals, EasyA Kickstart, Mint Club, o1 Launchpad). Per pool and per DEX volume, liquidity and new pools. Token info with holders and holder distribution, for example USDG at 445K holders, top 10 holding 57%. | Free, about 30 calls a minute, partly used |
| Blockscout stats service and keyed gateway | Chain activity, token holders, supply, transfers, contract transaction counts | Free, used |

**Paid, so leave out for now.**
- DefiLlama perps volume (`/overview/derivatives`), `/raises`, `/oracles` and `/chainAssets`.
- DefiLlama bridge volume per chain (`bridges.llama.fi`).
- NFT marketplace volume (no free chain-level source found).

## 3. Per-sector metrics
Leaders are from the sector leaders file. "Headline" is the first row.

### DEXs and Liquidity (Uniswap, Fables, RAMSES, up., Rialto)
| Metric | Source | Effort |
|---|---|---|
| **Headline** 30d DEX volume | DefiLlama dexs | S |
| TVL | DefiLlama | S |
| 30d fees, revenue, capture | DefiLlama fees | S |
| Pools and liquidity on the chain, top pairs | GeckoTerminal per DEX | M |
| Aggregator volume, for routers like Rialto Aggregator and Uniswap aggregator | DefiLlama aggregators | M |
| Share of stock-token volume | GeckoTerminal pools whose base token is a stock token | M |

### Launchpads (Pons, Long, Clutch Markets, Flap, letscash.fun, pools.trade)
| Metric | Source | Effort |
|---|---|---|
| **Headline** 30d volume of tokens launched on the venue | GeckoTerminal per launchpad DEX | M |
| Tokens launched in the last 30 days | GeckoTerminal new pools per DEX, paged | M |
| 30d fees and revenue | DefiLlama fees, 55 launchpads listed | S |
| TVL where reported | DefiLlama | S |
| Graduated or still-trading tokens (volume above $10K in 7 days) | GeckoTerminal | M |

### AI Agents (Virtuals, Bankr, Project VEX, Sherwood, Orbio)
| Metric | Source | Effort |
|---|---|---|
| **Headline** agent token 30d volume on the chain | GeckoTerminal DEX pages for Virtuals and Bankr, and the project token for others | M |
| Agent tokens live on the chain | GeckoTerminal pool count per agent DEX | M |
| Project token holders | GeckoTerminal token info | L |
| TVL, fees for agent vaults (Orbio, Sherwood) | DefiLlama | S |

### Infrastructure and Dev Tools (Arbitrum, Chainlink, Alchemy, Blockscout, Goldsky)
| Metric | Source | Effort |
|---|---|---|
| Unmeasured sector, so no headline or tier. Role shown as text, for example "Rollup stack" or "Oracle". | Dataset | S |
| Chainlink feeds live on the chain | Existing Chainlink feed list in the repo | S |
| Token lockers' locked value (UNCX, Team Finance) | DefiLlama `-vesting` and TVL | S |
| Contracts deployed and verified (chain-wide, shown on Arbitrum's card only) | Blockscout stats | S |
| Everything else | Offchain, so "Not applicable" | |

### NFTs, Gaming and Collectibles (OpenSea, Pull.fun, Quotrons, Fudarake, Robinhood Punks)
| Metric | Source | Effort |
|---|---|---|
| **Headline** holders | Blockscout per collection | L |
| 30d transfers | Blockscout | L |
| Fees and TVL for gacha and gamified apps (Pull.fun, HASHCATS) | DefiLlama, 10 "Gamified Mining" protocols listed | S |
| Marketplace volume | Paid or none, so Not tracked | |

### Lending and Credit (Morpho, Maple, Longbow, NetNet Capital, Priors)
| Metric | Source | Effort |
|---|---|---|
| **Headline** total deposited (collateral plus lending supply, about $1.06B for Morpho) | Morpho API for Morpho, DefiLlama TVL plus `-borrowed` for others | S |
| Borrowed | DefiLlama `-borrowed`, 17 protocols | S |
| Utilization (borrowed over supplied) | Computed | S |
| Supply and borrow APY, top markets with collateral | Morpho GraphQL for Morpho, yields `/lendBorrow` for the rest | M |
| Share of loans backed by stock tokens | Morpho markets by collateral type | M |
| 30d fees (interest paid). Revenue shows "$0 by design" where the source says so. | DefiLlama fees | S |
| DEX volume | Not applicable, hidden | |

### Security, Risk and Compliance (Chainalysis, TRM Labs, Blockaid, Chain Insights)
| Metric | Source | Effort |
|---|---|---|
| Unmeasured sector, so no headline or tier. Fact shown is chain projects that list this firm as auditor. | Audits column and DefiLlama `audit_links` | S |
| Mostly offchain, so other metrics are Not applicable | | |
| Incidents (chain-level only, on the Security page, never per project in public views) | DefiLlama hacks | M |

### Yield and Asset Management (Steakhouse, Pendle, Saffron, EARN)
| Metric | Source | Effort |
|---|---|---|
| **Headline** TVL (assets managed, flagged as double counted for curators like Steakhouse) | DefiLlama | S |
| Net APY, base and reward split | DefiLlama yields pools, Morpho vaults | M |
| Number of vaults or pools on the chain | Yields pools | M |
| 30d fees and performance fees | DefiLlama fees | S |

### Data and Analytics (Dune, DefiLlama, Arkham, Artemis, Allium)
| Metric | Source | Effort |
|---|---|---|
| Unmeasured sector, so no headline or tier. Fact shown is Robinhood Chain supported, with date added. | Dataset | S |
| Offchain, so everything else is Not applicable | | |

### RWA and Tokenized Stocks (Ondo Global Markets, IXS, The Index, Midas)
| Metric | Source | Effort |
|---|---|---|
| **Headline** tokenized value on the chain (supply times price) | Blockscout supply and the stock price pipeline | L |
| Holders | Blockscout or GeckoTerminal | L |
| 30d DEX volume of their tokens | GeckoTerminal | L |
| Yield, for products like Midas | Yields pools | M |
| Used as Morpho collateral (yes, with amount) | Morpho GraphQL | M |

### Trading Tools and Bots (GMGN, Axiom, Karma, Moby)
| Metric | Source | Effort |
|---|---|---|
| **Headline** 30d volume routed | DefiLlama dexs or aggregators, flagged as double counted | S |
| 30d fees and revenue | DefiLlama fees | S |
| Daily users, where listed | DefiLlama active users | S |

### Wallets and Custody (MetaMask, Phantom, Trust Wallet, Fireblocks)
| Metric | Source | Effort |
|---|---|---|
| Unmeasured sector, so no headline or tier. Fact shown is Robinhood Chain supported, with date. | Dataset | S |
| Smart wallets active on the chain (chain-wide, context only) | Blockscout stats | S |
| Per-wallet users | No free source, so Not tracked | |

### Perps, Options and Derivatives (Arcus, Lighter, Aster, Grid)
| Metric | Source | Effort |
|---|---|---|
| **Headline** open interest | DefiLlama open interest | M |
| 30d fees and revenue | DefiLlama fees | S |
| TVL (collateral) | DefiLlama | S |
| Options notional and premium | DefiLlama options | M |
| Perps volume | Paid, so Not tracked for now | |

### Memecoins and Community (Artificially Inu, PENGU, Asteroid Shiba, Strategy Coin)
| Metric | Source | Effort |
|---|---|---|
| **Headline** 30d DEX volume on the chain | GeckoTerminal | L |
| Holders | GeckoTerminal token info | L |
| Liquidity | GeckoTerminal | L |
| Market cap is not shown, since sources give a global figure, not chain-specific | | |

### Bridges and Interoperability (Relay, Across, LayerZero)
| Metric | Source | Effort |
|---|---|---|
| **Headline** 30d bridge aggregator volume where listed (LI.FI, Socket, Jumper, 0x) | DefiLlama bridge aggregators | M |
| 30d fees (Relay) | DefiLlama fees | S |
| TVL for lock-and-mint bridges | DefiLlama, 5 listed | S |
| Per-bridge volume for Across and Stargate | Paid, so Not tracked | |

### Exchanges and On/Off-Ramps (Bitstamp, Binance Alpha, MoonPay)
| Metric | Source | Effort |
|---|---|---|
| Unmeasured sector, so no headline or tier. Fact shown is assets held on Robinhood Chain (CEX wallets, not counted in chain TVL). | DefiLlama CEX TVL on the chain, 5 listed | S |
| Ramps are offchain, so Not applicable | | |

### Stablecoins and Payments (Paxos, Ethena, Circle)
| Metric | Source | Effort |
|---|---|---|
| **Headline** supply on the chain | DefiLlama stablecoins | M (in the traction prompt) |
| Holders, 30d transfers | Blockscout | L |
| Used as Morpho loan asset (amount) | Morpho GraphQL | M |
| Payments apps have contract transactions only | Blockscout | L |

### Prediction Markets (Meridian, legs.fun, Overcall)
| Metric | Source | Effort |
|---|---|---|
| **Headline** open interest | DefiLlama open interest (Meridian Predict listed) | M |
| 30d fees, TVL | DefiLlama | S |
| Trading volume | Not tracked (no free chain feed found) | |

## 4. Order of work
1. **S items first, roughly a day.** Accuracy rules, sector cards, measured and unmeasured sectors, the three labels, hiding Not applicable rows, lending supplied, borrowed and utilization, CEX on-chain assets, and holders revenue.
2. **M items, two to three days.** Aggregators, bridge aggregators, open interest, options, yields pools and lendBorrow, Morpho GraphQL, GeckoTerminal per launchpad and agent DEX, and hacks for the Security page.
3. **L items, ongoing.** Token and collection address mapping for memecoins, NFTs, RWA, agents and stablecoins. This shares the `contracts.csv` work and spoof guard from the traction prompt.

---

## Claude Code prompt
Paste below into Claude Code in `robinhoodchain-dashboard`, in plan mode. Attach this file as `docs/SECTOR-METRICS.md`.

### Task
Give every sector its own metrics in the project pop-up, sector cards and sector leaders view, following `docs/SECTOR-METRICS.md`, including section 0 (accuracy rules) and section 1b (sector cards). Section 1b replaces the sector card part of the earlier traction sources prompt (the With traction stat and the "Mostly offchain services" line). The "with traction" definition from that prompt still drives the Traction tab and Listed vs live chart. Work in the order of section 4 and stop after each step with screenshots.

### Requirements
1. **Registry.** Add a sector metric registry in `src/lib/sector-metrics.ts`. Per sector it lists metric ids, labels, InfoTip text, source, and which metric is the headline.
   - The project pop-up's Traction and Financials blocks render from the registry instead of one fixed list.
   - The sector leaders modal ranks by the headline metric and shows it on each row.
2. **Labels.** Every metric value has a state, `value`, `zero-by-design`, `not-applicable` or `not-tracked`.
   - Not applicable rows are hidden.
   - Zero by design shows "$0" with the reason in the InfoTip, for example "Morpho takes no protocol fee. Interest goes to lenders and curators."
   - Use DefiLlama's methodology text when it states zero revenue.
3. **New fetchers.** Add each as its own fetcher in `scripts/fetch/`, with the trailing 7-day re-fetch, status in `_meta.json`, and graceful skip.
   - DefiLlama aggregators, bridge aggregators, open interest, options, hacks, yields pools and lendBorrow (filter `chain === "Robinhood Chain"`), and the `-borrowed`, `-staking` and `-vesting` keys from `/protocol/{slug}`.
   - Morpho GraphQL for chainId 4663, covering markets and vaults.
   - GeckoTerminal per-DEX pools and new pools for launchpad and agent venues, within its rate limit.
4. **Measured and unmeasured.** Add a `measured` flag per sector in the registry.
   - Unmeasured sectors get no Traction heading, no tier ("Not applicable") and no place in tier charts or the Traction leaderboard.
   - Sector cards follow section 1b.
   - Lending pop-ups show Total deposited, Borrowed and TVL side by side, each with its definition.
5. **Accuracy.** Implement the four rules in section 0, including the Other Signal date and conflict check, and the 10% source gap check on headline metrics. Print a review list of conflicting signals.
6. **Tiers.** Each measured sector's headline feeds the tier through the same thresholds.
   - Supplied for lending, open interest for perps and prediction markets, and supply for stablecoins and RWA all count like TVL.
   - Launchpad and token volume count like 30-day volume.
   - Holders never set a tier on their own.
7. **Double counting.** None of these new metrics enter the chain KPIs except where DefiLlama's chain totals already include them. Curator TVL, CEX on-chain assets, aggregator and bot volume stay flagged as double counted.
8. **Wording.** Name DefiLlama, GeckoTerminal, Blockscout and Morpho in InfoTips and Methodology only, not in headings or card text.

### Checks
- Unit tests cover the registry, the four states, utilization math (borrowed over TVL plus borrowed) and the headline ranking per sector.
- Sector card tests confirm no With traction stat, "Robinhood native" as count and share, and 3 leaders ranked by headline (curated rank for unmeasured sectors).
- A snapshot test checks Morpho's pop-up shows total deposited, borrowed, TVL, utilization and "$0 by design" revenue, with no DEX volume row.
- Build, tests, `npm run check:copy` and Playwright at 1440 and 390px pass.
- Commit per step, authored as Wazarat, no attribution trailers. Pull with rebase before pushing.
