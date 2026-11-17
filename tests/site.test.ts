import { describe, expect, it } from "vitest";
import { hostFallback, normalizeSiteUrl, pageMeta, siblingUrl, SITE } from "@/lib/site";

describe("site settings", () => {
  it("strips trailing slashes and falls back to localhost", () => {
    expect(normalizeSiteUrl("https://robinhood.canhav.com/")).toBe("https://robinhood.canhav.com");
    expect(normalizeSiteUrl("https://robinhood.canhav.com///")).toBe("https://robinhood.canhav.com");
    expect(normalizeSiteUrl(undefined)).toBe("http://localhost:3100");
    expect(normalizeSiteUrl("robinhood.canhav.com")).toBe("http://localhost:3100");
    expect(normalizeSiteUrl("https://robinhood.canhav.com/path")).toBe("http://localhost:3100");
  });
  it("falls back to the host's own production URL when the site URL is unset", () => {
    expect(hostFallback("example.vercel.app")).toBe("https://example.vercel.app");
    expect(hostFallback("")).toBeUndefined();
    expect(hostFallback(undefined)).toBeUndefined();
    expect(normalizeSiteUrl(hostFallback("example.vercel.app"))).toBe("https://example.vercel.app");
  });
  it("accepts a sibling atlas only as an absolute http URL", () => {
    expect(siblingUrl("https://near.canhav.com")).toBe("https://near.canhav.com");
    expect(siblingUrl("")).toBeNull();
    expect(siblingUrl("near.canhav.com")).toBeNull();
    expect(siblingUrl(undefined)).toBeNull();
  });
  it("builds per-page metadata with a canonical and an Open Graph URL", () => {
    const m = pageMeta("Investors", "/investors/");
    expect(m.title).toBe("Investors");
    expect(m.alternates?.canonical).toBe("/investors/");
    const og = m.openGraph as { url?: string; siteName?: string; images?: Array<{ url: string }> };
    expect(og.url).toBe("/investors/");
    expect(og.siteName).toBe("CanHav Research");
    expect(og.images?.[0]?.url).toBe("/og.png");
    expect(SITE.title).toBe("CanHav Research, Base Ecosystem Atlas");
  });
});

describe("hidden tabs", () => {
  it("keeps Security and Investors out of the nav and the index but not deleted", async () => {
    const { NAV, NAV_ALL, isHiddenPath } = await import("@/lib/nav");
    const { pageMeta } = await import("@/lib/site");
    expect(NAV.map((n) => n.label)).toEqual(["Overview", "Sectors", "Traction", "Funding", "Explorer", "Compare"]);
    expect(NAV_ALL.filter((n) => n.hidden).map((n) => n.href)).toEqual(["/security/", "/investors/"]);
    expect(isHiddenPath("/investors/")).toBe(true);
    expect(pageMeta("Investors", "/investors/").robots).toEqual({ index: false, follow: true });
    expect(pageMeta("Funding", "/funding/").robots).toBeUndefined();
  });
});
