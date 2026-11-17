import { describe, expect, it } from "vitest";
import { events } from "@/lib/data";
import { isDirectSource } from "@/lib/sources";

describe("direct sources", () => {
  it("accepts one article, one post or one page about the subject", () => {
    expect(isDirectSource("https://blog.arbitrum.io/robinhood-chain-testnet/")).toBe(true);
    expect(isDirectSource("https://x.com/pendle_fi/status/2095861150504325271")).toBe(true);
    expect(isDirectSource("https://twitter.com/someone/status/123?s=20")).toBe(true);
    expect(isDirectSource("https://ethbeat.org/layer2s/projects/robinhood#liveness")).toBe(true);
    expect(isDirectSource("https://defillama.com/protocol/uniswap")).toBe(true);
    // An archived copy of a page that will change counts as direct, since it lands on the claim.
    expect(isDirectSource("https://web.archive.org/web/20261109023121/https://ethbeat.org/layer2s/projects/robinhood#liveness")).toBe(true);
  });
  it("rejects a profile, a home page and anything that is not a web link", () => {
    expect(isDirectSource("https://x.com/RobinHubHB")).toBe(false);
    expect(isDirectSource("https://x.com/RobinHubHB/")).toBe(false);
    expect(isDirectSource("https://x.com/RobinHubHB/with_replies")).toBe(false);
    expect(isDirectSource("https://x.com/search?q=robinhood")).toBe(false);
    expect(isDirectSource("https://www.twitter.com/RobinHubHB")).toBe(false);
    expect(isDirectSource("https://meridian.xyz")).toBe(false);
    expect(isDirectSource("https://meridian.xyz/")).toBe(false);
    expect(isDirectSource("mailto:someone@example.com")).toBe(false);
    expect(isDirectSource("not a url")).toBe(false);
    expect(isDirectSource("")).toBe(false);
    expect(isDirectSource(null)).toBe(false);
    expect(isDirectSource(undefined)).toBe(false);
  });
  it("finds a direct source on every timeline event", () => {
    const missing = events.filter((e) => !isDirectSource(e.sourceUrl)).map((e) => e.title);
    expect(missing).toEqual([]);
  });
});
