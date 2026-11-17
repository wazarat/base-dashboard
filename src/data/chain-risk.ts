/**
 * Chain-level risk checklist, structured by hand from the findings memo
 * (data/robinhood-chain-traction-funding-security-*.md, "Security" section).
 * Levels: red = material risk today, amber = partial mitigation or open question,
 * green = mitigated or positive.
 */
export type RiskLevelMark = "red" | "amber" | "green";

export interface ChainRiskItem {
  id: string;
  label: string;
  level: RiskLevelMark;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
}

const L2BEAT = "https://ethbeat.org/scaling/projects/robinhood";

export const chainRisk: ChainRiskItem[] = [
  {
    id: "stage",
    label: "L2BEAT stage",
    level: "red",
    detail: "Rated below Stage 0. The rollup does not yet meet the minimum decentralisation requirements.",
    sourceLabel: "L2BEAT",
    sourceUrl: L2BEAT,
  },
  {
    id: "challengers",
    label: "Fraud-proof challengers",
    level: "red",
    detail: "Only 2 whitelisted challengers can dispute state roots. Anyone outside that list cannot.",
    sourceLabel: "L2BEAT",
    sourceUrl: L2BEAT,
  },
  {
    id: "upgrades",
    label: "Upgrade control",
    level: "red",
    detail: "Instant upgrades through a Robinhood 7-of-8 multisig. No Security Council.",
    sourceLabel: "L2BEAT",
    sourceUrl: L2BEAT,
  },
  {
    id: "exit",
    label: "Exit window",
    level: "red",
    detail: "No exit window. Users cannot withdraw ahead of a malicious or buggy upgrade.",
    sourceLabel: "L2BEAT",
    sourceUrl: L2BEAT,
  },
  {
    id: "sequencer",
    label: "Sequencer",
    level: "amber",
    detail:
      "Centralised Robinhood sequencer with a transaction filter that can fail forced L1 transactions. Used after the Vlad Tenev account hack to freeze a related wallet.",
    sourceLabel: "Decrypt, Jul 23 2026",
    sourceUrl: "https://decrypt.co/374175/robinhood-ceo-vlad-tenevs-x-account-hacked-to-shill-fake-vladhood-token",
  },
  {
    id: "liveness",
    label: "Liveness record",
    level: "amber",
    detail:
      "On Sep 4 2026, about 40 minutes of app disruption and a 14-minute gap in batches reaching Ethereum. On Oct 29 2026, a 54-minute gap in state updates. Blocks kept being produced.",
    sourceLabel: "CryptoSlate, L2BEAT",
    sourceUrl: "https://cryptoslate.com/robinhood-chain-kept-producing-blocks-through-a-roughly-40-minute-app-disruption/",
  },
  {
    id: "stock-oracle",
    label: "Stock-token pricing",
    level: "amber",
    detail:
      "No confirmed pricing or weekend-gap liquidation incident so far. QuillAudits flags that oraclePaused() is advisory only.",
    sourceLabel: "Findings memo",
    sourceUrl: "https://defillama.com/chain/robinhood-chain",
  },
  {
    id: "stack",
    label: "Rollup stack",
    level: "green",
    detail: "Built on the Arbitrum (Nitro) stack, which has a long production track record on Arbitrum One.",
    sourceLabel: "Arbitrum blog",
    sourceUrl: "https://blog.arbitrum.io/robinhood-chain-testnet/",
  },
  {
    id: "explorers",
    label: "Monitoring coverage",
    level: "green",
    detail: "Blockscout, Etherscan, Arkham and L2BEAT all index the chain, so outages and anomalies are recorded publicly.",
    sourceLabel: "L2BEAT",
    sourceUrl: L2BEAT,
  },
];
