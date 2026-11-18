/**
 * Everything specific to the chain this atlas covers, in one place.
 * Scripts and the app read these instead of repeating the chain's keys.
 */
export const CHAIN = {
  /** Display name and the key DefiLlama uses in chainTvls, stablecoins and yields. */
  name: "Base",
  /** Lowercase path segment for DefiLlama overview endpoints. */
  llamaOverview: "base",
  llamaChainRow: "base",
  chainId: 8453,
  geckoNetwork: "base",
  morphoChainId: 8453,
  blockscoutGateway: "https://api.blockscout.com/8453/api/v2",
  /**
   * Blockscout lists Base as a featured chain, so its gateway answers HTTP 402 on a free key
   * ("requires one of the following plans: Builder, Business, Pro", checked Nov 18 2026).
   * While false the Blockscout sources skip without calling, and holders come from GeckoTerminal.
   */
  blockscoutFree: false,
  explorer: "https://base.blockscout.com",
  geckoTokenPage: "https://www.geckoterminal.com/base/tokens/",
  growthepieKey: "base",
  nativeLabel: "Base native",
  /** Mainnet launch, Aug 9 2023. Chain history before it is left off charts. */
  mainnet: "2023-08-09",
  /** Default start of the timeline; earlier events sit behind Show earlier events. */
  timelineStart: "2025-01-01",
} as const;

export const NOT_AFFILIATED = "Independent research by CanHav Research, not affiliated with Base or Coinbase";
