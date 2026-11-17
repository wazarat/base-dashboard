# Base Atlas ecosystem list and taxonomy (Nov 17, 2026)

Companion to `claude/base-ecosystem-2026-11-17.csv` (924 projects). Same 29-column schema as the Robinhood Chain file, with `TVL on Robinhood Chain (USD)` renamed to `TVL on Base (USD)`.

## Sources
1. **Base official directory.** 598 entries from `apps/web/src/data/ecosystem.json` in the base/web repo, last updated Mar 2026. 5 rebranded duplicates dropped (Coinbase Wallet, Socket, Connext, Mirror, Satsuma) because their successors are listed, plus one placeholder ("Test Project"). Warpcast is renamed Farcaster.
2. **DefiLlama.** Base chain page fetched Nov 17, 2026 for the top 23 protocols by TVL (chain DeFi TVL $6.2B, 1,011 protocols). The DefiLlama-Adapters repo was scanned for live adapters with a Base key (765 slugs). About 190 recognisable ones were added and classified. The other 444 are in `claude/base-defillama-adapters-to-verify-2026-11-17.csv` for a later pass.
3. **Web research.** Base App, x402 and agent payments, launchpads (Clanker, Doppler, Flaunch, Ape.Store), prediction markets (Limitless, Myriad), Base Ecosystem Fund deals, monthly Base launch threads.
4. **Base Batches.** Cohort 003 (12 teams, Apr 2026) and Batches 001 regional winners (status `Hackathon project`).
5. **Prior knowledge.** 82 rows tagged `Prior knowledge (not re-verified)` in Discovered Via. Verify these first.

## Taxonomy
Robinhood's 19 sectors are kept, with three Base-specific changes.
- **RWA & Tokenized Stocks** becomes **RWA & Tokenized Assets** (as on NEAR), since Base RWA is mostly treasuries, credit and real estate.
- **Social & Identity** is added (from NEAR). Base is the home of Farcaster mini apps, Base App, Basenames and creator coins.
- **DAOs, Governance & Public Goods** and **Ecosystem, Funding & Education** are added (from NEAR) for DAO tools, Base Ecosystem Fund and Base Batches.
- Subcategories reuse the Robinhood names where they exist. New ones include Vault curators, Creator coin platforms, Decentralized AI networks, Fixed-rate and term lending, Unsecured and credit-scored lending, Payroll streaming and vesting, and Wrapped assets.
- Zora sits in Launchpads > Creator coin platforms. Virtuals and Bankr sit in AI Agents > Agent launchpads, matching the Robinhood file.

| Sector | Projects | Base native | Subcategories (count) |
|---|---|---|---|
| NFTs, Gaming & Collectibles | 96 | 28 | Games (46), NFT marketplaces and tools (29), NFT collections and art (9), NFT creator tools (7), Gaming infrastructure (5) |
| DEXs & Liquidity | 80 | 19 | AMM DEXs (48), DEX aggregators and routing (14), Liquidity management (9), Hooks and DEX infrastructure (5), Order book DEXs (4) |
| Infrastructure & Dev Tools | 79 | 1 | Data and indexing (21), RPC and nodes (18), Oracles (13), Dev tools and accounts (9), DePIN, storage and compute (6), Token tools and lockers (5), Explorers (4), Rollup and chain infrastructure (3) |
| Social & Identity | 72 | 17 | Social apps (27), Identity and reputation (17), Creator and publishing platforms (10), Music (7), Quests and growth (6), Messaging (4), Media (1) |
| AI Agents | 62 | 30 | Agent platforms (14), Agent infrastructure and data (12), Trading and yield agents (12), Consumer and social agents (10), Decentralized AI networks (6), Agent payments and wallets (4), Agent launchpads (4) |
| Yield & Asset Management | 59 | 4 | Vaults and yield aggregators (24), Vault curators (10), Asset management (8), Liquid staking and restaking (7), Savings and yield apps (5), Yield tokenization and strategies (3), Leveraged yield (2) |
| Bridges & Interoperability | 57 | 1 | Bridges (35), Interoperability protocols (11), Bridge aggregators (9), Wrapped assets (2) |
| Wallets & Custody | 56 | 2 | Wallets (31), Smart wallets and account abstraction (10), Custody and wallet infrastructure (10), Hardware wallets (3), Multisig (2) |
| Stablecoins & Payments | 54 | 9 | Stablecoins (22), Payments (18), Payroll, streaming and vesting (6), Consumer finance apps (5), Stablecoin infrastructure (3) |
| Lending & Credit | 50 | 9 | Lending markets (27), Private and institutional credit (8), CDPs (5), Fixed-rate and term lending (5), Unsecured and credit-scored lending (3), Lending tools and automation (2) |
| Perps, Options & Derivatives | 48 | 15 | Perps (36), Options (6), Structured products and leverage (4), Perps infrastructure (2) |
| Data & Analytics | 34 | 0 | Data and analytics (25), Portfolio trackers (6), Tax and accounting (3) |
| RWA & Tokenized Assets | 31 | 5 | Tokenized treasuries and funds (7), Real-world apps (7), RWA yield and investment (5), Tokenization infrastructure and marketplaces (4), Real estate (3), Tokenized stocks (3), Carbon and environmental assets (1), Commodities (1) |
| Security, Risk & Compliance | 26 | 0 | Security and audits (12), Risk monitoring (5), Privacy (4), Wallet security (2), Compliance (2), Insurance (1) |
| Exchanges & On/Off-Ramps | 25 | 1 | On and off-ramps (14), Centralized exchanges (8), OTC and P2P (2), Institutional prime and custody (1) |
| Launchpads | 23 | 13 | Token launchpads (12), Launchpad tools and infrastructure (9), Token sale platforms (1), Creator coin platforms (1) |
| DAOs, Governance & Public Goods | 16 | 5 | DAO and governance tools (8), DAOs and communities (5), Public goods and impact (3) |
| Prediction Markets | 15 | 11 | Prediction markets (14), Prediction market tools (1) |
| Memecoins & Community | 14 | 14 | Memecoins (14) |
| Trading Tools & Bots | 10 | 0 | Trading terminals and bots (10) |
| Ecosystem, Funding & Education | 7 | 2 | Education and community (3), Funds and accelerators (3), Ecosystem programs (1) |
| Other | 10 | 10 | Unknown (10) |

## Field rules
- **Native Chain.** Base native, Other EVM, Other non-EVM, or Centralized / off-chain (CEXs, ramps, audit firms, RPC and analytics vendors, curators). 181 rows are Low confidence and came from a name and description heuristic. They need checking.
- **Traction Tier.** Set only for the 23 DefiLlama top protocols, using the CanHav thresholds (Tier 1 at $50M+ TVL, Tier 2 at $2M+). Everything else is `Not tracked` until the dashboard pipeline pulls DefiLlama.
- **Curators.** Steakhouse, Gauntlet and Clearstar TVL overlaps Morpho. Exclude them from chain totals (flagged in Other Traction Signal).
- **Funding.** Filled only where a Base Ecosystem Fund or Base Batches link was found. All else is `Not researched`.
- **Security.** Not researched in this pass.
- **Status.** Mainnet where known, `Unknown` for most directory listings, `Building` for Batches 003, and Inactive or Defunct with a reason in Description (Vertex, Bunni, SimpleHash, Slingshot, friend.tech, Sonne, Mountain Protocol and others).

## Next passes
1. Verify Low-confidence native chain rows and the 82 prior-knowledge rows.
2. Classify the 444 DefiLlama long-tail slugs.
3. Traction, funding and security passes, as done for Robinhood and NEAR.
4. Add X handles.
