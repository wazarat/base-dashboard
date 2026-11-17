# Base ecosystem, traction and funding (Nov 17, 2026)

Companion to `claude/base-ecosystem-2026-11-17.csv` (now 1,040 projects, same 29 columns) and `claude/base-funding-rounds-2026-11-17.csv` (112 rounds, 46 of them Base-related). Traction is from the DefiLlama API pulled Nov 17, 2026. Funding comes from web research plus the shared rows of the Robinhood rounds file.

## What changed in the CSV
- **Traction filled for 451 projects** (TVL on Base, 30d DEX volume, 30d fees, 30d revenue). 349 existing rows matched DefiLlama, and 114 new rows were added for Base protocols with traction that the first pass missed (TVL of $100K+, 30d volume of $1M+, or 30d fees of $10K+).
- **Tiers** use the CanHav thresholds. Tier 1 is TVL $50M+, volume $500M+ or fees $1M+. Tier 2 is TVL $2M+, volume $50M+ or fees $100K+. Tier 3 is anything tracked below that. Counts are 17 Tier 1, 84 Tier 2, 301 Tier 3, 49 tracked but negligible, and 589 not tracked.
- **Funding filled for 99 projects** from 112 rounds. The other 939 stay `Not researched`.
- **Renames and status updates.** Avantis is now Veranta (DefiLlama lists it at veranta.xyz). Farcaster and Clanker are operated by Neynar since Jan 21, 2026. Myriad moved its markets to BNB Chain in Mar 2026.

## Traction

Chain level
- DefiLlama Base chain TVL is $5.20B. Summing the list gives $6.63B even after excluding curators, because allocators like Spark and Grove deposit into Morpho and Aave. Use the chain figure for headline TVL.
- 30d DEX volume is $31.5B across 208 DefiLlama listings.
- Base itself earned $2.72M in 30d sequencer fees.

Leaders (30 days)
- **DEXs.** Aerodrome $17.4B volume (56% of Base), $8.5M fees, $6.5M revenue. Uniswap $7.1B. PancakeSwap $3.1B. Curve $1.2B. Metric $621M, a newcomer with under $1M TVL.
- **Lending.** Morpho $3.85B TVL and $17.6M fees, the largest fee earner on Base. Aave $469M. Spark $412M. Moonwell is far behind at $12.4M TVL.
- **Curators.** Steakhouse $1.28B and Gauntlet $580M. Their TVL overlaps Morpho, so it is flagged in Other Traction Signal and excluded from totals.
- **Perps.** Veranta (Avantis) $10.6M TVL, $1.18M fees, $84M open interest. Perps volume needs a paid DefiLlama key, so the column is blank for perps.
- **AI and agents.** Venice $1.14M fees (VVV buy and burn), Central City $1.31M fees, Bankr $436K fees. x402 moved $14.0M in payments.
- **Launchpads have cooled.** Clanker earned $369K in 30d fees, against over $8M a week in Feb 2026. Zora coins earned $3.5K, Virtuals $69K, and Flaunch under $1K.
- **Prediction markets.** Limitless did $542K volume. Sport.fun $2.7M. Trueo $0.9M.

Native vs imported
- Base-native projects are 23% of the list. They hold 6% of TVL but take 58% of DEX volume, 21% of fees and 48% of revenue, almost all through Aerodrome.
- Base-native Tier 1 and 2 projects are Aerodrome, Veranta, Clanker, Bankr, Venice, Hydrex, YO Protocol, 40 Acres, Base App and o1.exchange, plus several new DEXs (ElfomoFi, Kipseli, BaiBai) and curators.

## Funding

Base-related rounds, 2025 to 2026
- Venice $65M Series A at $1B (Dragonfly, Coinbase Ventures; Jul 2026)
- Limitless $10M seed (1confirmation, Coinbase Ventures; Oct 2025)
- YO Protocol $10M Series A (Foundation Capital, Coinbase Ventures; Dec 2025)
- Towns $10M Series B (a16z crypto, Coinbase Ventures; Apr 2025)
- Doppler $9M seed (Pantera; Jan 2026)
- Avantis $8M Series A (Founders Fund, Pantera; announced Jun 2025)
- Megapot $5M pre-seed (Dragonfly; Mar 2026)
- Coop Records $4.5M seed (1kx, Nascent; Sep 2025)
- Giza $2.2M, HeyElsa $3M, Charms $1.5M, Football.fun $2M

Acquisitions
- Coinbase bought Echo (Sonar token sales) for about $375M (Oct 2025).
- Farcaster bought Clanker (Oct 2025). Neynar then acquired Farcaster, its app and Clanker (Jan 2026). Farcaster's founders returned about $180M to investors.
- Kraken bought Backed (xStocks) in Dec 2025.

Base Ecosystem Fund
- Disclosed portfolio includes Avantis, BSX, Onboard, OpenCover, Paragraph, Truflation, Talent Protocol, Bankr, Giza, HeyElsa, Coop Records, Charms, g8keep, Farworld, Trendies, Multipli and Hurupay.
- Base Batches 003 (Apr 2026) had 12 teams. Each is logged as an accelerator round.

Gaps
- DefiLlama's raises API needs a paid key, so funding was researched one project at a time. Projects with no row in the rounds file stay `Not researched`, not `Not disclosed`.
- 11 rounds carry "Prior knowledge (re-verify)", carried over from the Robinhood file.

## Next steps
1. A funding sweep of the remaining Base-native projects with traction (Hydrex, 40 Acres, Kipseli, ElfomoFi, Metric, Central City, Snuggle, Flaunch, Moonwell).
2. Perps volume via a DefiLlama Pro key or the protocols' own APIs.
3. A security pass, as for Robinhood (audits, incidents, red flags).
