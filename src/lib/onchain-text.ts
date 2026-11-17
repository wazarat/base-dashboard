/**
 * Sentences for onchain traction, generated from the data (pure, so they are tested).
 * Example: "USDG on the chain $626M, 446.2K holders".
 */
import { fmtCompact, fmtUsd } from "./format";
import { RECENT_TRANSFER_CAP, type OnchainSignal } from "./onchain";

const money = (v: number) => fmtUsd(v, { digits: v >= 1e6 && v < 1e9 ? 0 : 1 });

export function signalSentence(s: OnchainSignal): string {
  const holders = s.holders !== null ? `${fmtCompact(s.holders)} holders` : null;
  const parts: string[] = [];
  if (s.kind === "stablecoin") parts.push(s.usd !== null ? `${s.symbol} on the chain ${money(s.usd)}` : `${s.symbol} on the chain`);
  else if (s.kind === "rwa") parts.push(s.usd !== null ? `${s.symbol} supply on the chain ${money(s.usd)}` : `${s.symbol} on the chain`);
  else if (s.kind === "token") parts.push(s.usd !== null ? `${s.symbol} DEX volume on the chain ${money(s.usd)} in 30 days` : `${s.symbol} token on the chain`);
  else parts.push(`${s.symbol} collection`);
  if (holders) parts.push(holders);
  if (s.kind === "nft" && s.transfers30d !== null) parts.push(`${s.transfers30d >= RECENT_TRANSFER_CAP ? `${RECENT_TRANSFER_CAP}+` : fmtCompact(s.transfers30d)} transfers in 30 days`);
  return parts.join(", ");
}
