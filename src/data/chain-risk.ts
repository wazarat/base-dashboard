/**
 * Chain-level risk checklist for the Security page, from the Base project page on ETHBEAT
 * (formerly L2BEAT, which now redirects there) and incident reports, each opened on Nov 17 2026.
 * Levels: red = material risk today, amber = partial mitigation or open question,
 * green = mitigated or positive. Status is plain text; colour only marks the status word.
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

export const chainRisk: ChainRiskItem[] = [
  {
    id: "stage",
    label: "Stage 1 rollup on ETHBEAT",
    level: "amber",
    detail:
      "ETHBEAT, formerly L2BEAT, rates Base Stage 1 with all Stage 1 requirements met but only 1 of 3 Stage 2 requirements, because upgrades unrelated to provable bugs give less than 30 days to exit and Security Council powers are not limited to provable bugs.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
  {
    id: "proofs",
    label: "TEE and ZK multiproof system",
    level: "amber",
    detail:
      "Since Azul, state proposals can be backed by an AWS Nitro TEE attestation and an SP1 ZK proof, and anyone with a valid ZK proof can challenge a TEE only proposal, but the Coinbase run Coordinator Multisig controls the TEE prover allowlist and ETHBEAT marks the program hashes as not verified.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
  {
    id: "upgrades",
    label: "Instant upgrades by a 2 of 2 multisig",
    level: "red",
    detail:
      "All contracts sit behind a ProxyAdmin controlled by a 2 of 2 Base Governance Multisig made up of the Base Coordinator Multisig at 3 of 6 and the Base Security Council at 8 of 11, and ETHBEAT states there is no delay on upgrades.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
  {
    id: "exit",
    label: "5 day withdrawals with no upgrade exit window",
    level: "amber",
    detail:
      "Beryl cut single proof withdrawals from 7 days to 5 days and dual proof withdrawals can finalize in 1 day, but ETHBEAT lists no exit window before an unwanted upgrade and the Guardian multisig can pause withdrawals.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
  {
    id: "sequencer",
    label: "Single sequencer with slow forced inclusion",
    level: "amber",
    detail:
      "Base runs a single sequencer whose address Base Multisig 1 can change, and users can force transactions through Ethereum if it fails with a delay of up to 12 hours.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
  {
    id: "liveness",
    label: "Repeated halts and proposal stalls",
    level: "red",
    detail:
      "Base halted for 116 minutes on June 25 2026 and 20 minutes on June 26 2026 after a sequencer bug, following a 33 minute halt in August 2025. Proposal stalls in May and October 2026 are on the timeline with their own sources.",
    sourceLabel: "Cointelegraph on the Base post mortem",
    sourceUrl:
      "https://cointelegraph.com/news/base-post-mortem-reveals-sequencer-bug-behind-back-to-back-outages",
  },
  {
    id: "governance",
    label: "Own stack after leaving Superchain governance",
    level: "amber",
    detail:
      "Base left the shared Optimism Superchain setup on March 4 2026 and now runs its own SuperchainConfig and guardian, with no token or onchain vote and a Security Council charter that has no removal procedure or quorum loss fallback.",
    sourceLabel: "ETHBEAT Base project page",
    sourceUrl: "https://ethbeat.org/scaling/projects/base",
  },
];
