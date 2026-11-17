# Base ecosystem, funding sweep and security pass (Nov 17, 2026)

Companion to `claude/base-ecosystem-2026-11-17.csv` (1,038 projects, 29 columns) and `claude/base-funding-rounds-2026-11-17.csv` (406 rounds). It follows `base-traction-funding-2026-11-17.md`.

## What changed in the CSV
- **Funding** is now filled for 330 projects, up from 99. 283 rounds came from DefiLlama's per-protocol raises data, and 12 more from targeted searches.
- **Base-native projects with traction (108).** All 108 are checked. 22 are VC-backed, 7 token-funded, 2 Coinbase products, 1 a grant, 1 acquired and 1 DAO-funded. The other 74 show `Not disclosed`, meaning no round exists in DefiLlama raises as of Nov 17.
- **Security** is filled for 451 projects (those matched to DefiLlama), using DefiLlama audit status, audit links and its hacks database, plus manual checks. The counts are 180 Low, 167 Medium, 21 High and 83 Unknown. The other 587 are `Not researched`.
- **Duplicates merged.** Football.fun is now Sport.fun, and Truemarkets is now Trueo.
- **Status changes.** Seamless Protocol is Defunct (sunset announced Apr 7, 2026, UI offline Jul 1, 2026). Trueo is moving its main deployment from Base to Ethereum mainnet.

## Security rubric
The rubric uses DefiLlama data only. It is not a code review.
- **High.** Exploit losses since Nov 2024 of $250K or more on Base, or $5M or more on any chain.
- **Medium.** Any other recorded incident, a partial or forked audit, a risk curator (no audit of its own applies), or no audit listed with traction.
- **Low.** Audited per DefiLlama and no incidents listed.
- **Unknown.** No audit data and no traction.

## Chain level (L2BEAT and incident reports)
- **Stage 1 rollup.** Upgrades need both the Base Coordinator Multisig and the Base Security Council.
- **Multi-proofs since May 26, 2026.** Base Azul combines TEE attestations with SP1 ZK proofs.
- **Own governance since Mar 4, 2026.** Base left Optimism Superchain governance and has run its own base/base stack since May 2026. The Beryl upgrade cut the withdrawal period from 7 days to 5.
- **Single sequencer.** An invalid block halted Base for 116 minutes on Jun 25, 2026, and a race condition caused a further 20-minute stall on Jun 26. The previous major outage was 33 minutes in Aug 2025.
- **State update gap.** L2BEAT logged no state updates for about 23 hours on Oct 8 and 9, 2026. Updates normally land every 48 minutes.

## Incidents touching Base (DefiLlama hacks)
- 56 incidents since Nov 2024 involved Base, 37 of them in 2026. 26 were Base-only, losing about $17.2M.
- The most common types are access control (12), front-end and infrastructure (7), bridge (7), protocol logic (6) and oracle manipulation (6).

Notable incidents
- **Moonwell**, three incidents. Aug 27, 2026 lost $8.7M through MAMO collateral price manipulation. Feb 2026 lost $1.78M through a cbETH oracle misconfiguration. Nov 2025 left about $3.7M of bad debt from a wrsETH oracle fault. Borrowing on Base Core Markets was frozen after Aug 27.
- **Matcha (0x)**, Jan 24, 2026, $13.4M front-end compromise.
- **Garden**, Oct 2025 $11.4M key leak and Jul 2026 $0.45M database breach.
- **Wasabi**, Apr 2026, $5.5M deployer key compromise.
- **Arcadia**, Jul 2025, $2.5M reentrancy.
- **Bankr**, May and Jul 2026, $0.65M across a session key and social account takeover.
- **Kipseli**, Apr 2026, $0.07M.
- **Revert Lend** (Aerodrome vault), Jan 2026, $0.05M.
- **Balancer V2**, Nov 2025, $128M rounding exploit across chains including Base.
- **Binance**, Oct 29, 2026, about $6.3B hot wallet theft across about 10 chains via EIP-7702 delegation, the largest on record. It touched Base wallets.

High-risk rows (21)
- Bankr, Moonwell, Garden, 0x, Wasabi, Arcadia, Clober, Clipper, ACryptoS, KiloEx, Balancer, Yearn, 1inch, Bunni, Term Finance, Summer.fi, THORChain, DxSale, Trust Wallet, Binance, Bitget.
- Bankr and Clober are the only Base-native ones. Most others are multichain protocols whose losses happened elsewhere.

## Funding findings
- Base-related rounds since Jan 2025 disclosed about $191M across 50 rounds, excluding acquisitions.
- **Largest.** Architect $35M Series A (Dec 2025), Theo $20M (Apr 2025), YO $10M, Limitless $10M, Towns $10M, Doppler $9M, Ethos $8.4M token auction, Veranta $8M, Umia $6.1M token auction, XO Market $6M, Megapot $5M.
- **Most frequent backers.** Coinbase Ventures appears in 17 Base-related rounds, Base Batches in 12 and the Base Ecosystem Fund in 18. Pantera, a16z crypto, Paradigm and Borderless Capital follow with 3 to 4 each.
- **Token auctions are the new raise on Base.** Umia raised $6.1M (Galaxy, DCG, Draper) and Ethos about $8.4M through community auctions in Sep 2026, and Sport.fun ran a public token sale.
- **Leading natives with no VC.** Aerodrome has no priced VC round. Hydrex had only $10K from Peapods plus a CDP grant. Flaunch is built by the NFTX and FloorDAO team. 40 Acres, Zyfai, Snuggle and Infinity Pools have no disclosed round.
- **o1.exchange** raised $4.2M (Coinbase Ventures, AllianceDAO; Aug 2025). Syntetika raised a $2.5M seed through Hilbert Group's network.

## Gaps
- 708 rows still show `Not researched` funding. They are mostly multichain, infrastructure and directory-only projects outside DefiLlama raises.
- 587 rows have no security data. Audit status for DefiLlama rows should be verified against project docs before it is published as a rating.
- 11 rounds are prior knowledge and need re-verifying.
