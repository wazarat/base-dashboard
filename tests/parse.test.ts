import { describe, expect, it } from "vitest";
import {
  isAmountDisclosed,
  normalizeToken,
  parseMemoInsights,
  parseNumber,
  slugify,
  splitList,
  statusGroup,
  toEvent,
  toProject,
  type RawRow,
} from "@/lib/parse";

const baseRow: RawRow = {
  "Project/Company Name": "Test DEX",
  Website: "https://test.xyz",
  "Sector/Category": "DEXs & Liquidity",
  Subcategory: "",
  "Native Chain": "Base native",
  "Native Chain Detail": "Base",
  "Native Chain Confidence": "High",
  "Traction Tier": "Tier 2 - Strong",
  "TVL on Base (USD)": "1,234,567",
  "30d DEX Volume (USD)": "",
  "30d Fees (USD)": "1000",
  "30d Revenue (USD)": "900",
  "Other Traction Signal": "",
  "Traction Source": "https://a.example ; https://b.example",
  "Funding Type": "Corporate/parent; VC-backed",
  "Investors / Backers": "Someone",
  "Amount Raised": "~$5M (latest 2024)",
  Token: "None",
  "Funding Source URL": "",
  "Security Risk Level": "Medium",
  Audits: "",
  Incidents: "",
  "Red Flags": "",
  "Security Source URL": "",
  Description: "A test project",
  Status: "Mainnet (beta)",
  "X Handle": "@test",
  "Discovered Via": "DefiLlama",
  "Source URL": "https://defillama.com",
};

describe("parseNumber", () => {
  it("treats blank as null, never zero", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
  it("parses plain, comma and dollar formats", () => {
    expect(parseNumber("1234")).toBe(1234);
    expect(parseNumber("1,234,567")).toBe(1234567);
    expect(parseNumber("$12.5")).toBe(12.5);
  });
  it("throws on junk so the build fails loudly", () => {
    expect(() => parseNumber("n/a")).toThrow();
  });
});

describe("splitList", () => {
  it("splits semicolon lists and trims", () => {
    expect(splitList("a ; b;c")).toEqual(["a", "b", "c"]);
    expect(splitList("")).toEqual([]);
  });
});

describe("statusGroup", () => {
  it("collapses Mainnet variants", () => {
    expect(statusGroup("Mainnet (impaired)")).toBe("Mainnet");
    expect(statusGroup("Mainnet")).toBe("Mainnet");
    expect(statusGroup("Hackathon project")).toBe("Hackathon");
    expect(statusGroup("Something else")).toBe("Unknown");
  });
});

describe("isAmountDisclosed", () => {
  it("rejects placeholder values", () => {
    for (const v of ["Unknown", "None disclosed", "Undisclosed", "N/A", "n/a", "Undisclosed (Sep 4, 2026)", "n/a (DAO treasury)"]) {
      expect(isAmountDisclosed(v)).toBe(false);
    }
    expect(isAmountDisclosed(null)).toBe(false);
  });
  it("accepts figures", () => {
    expect(isAmountDisclosed("$68M latest (Nov 2025)")).toBe(true);
    expect(isAmountDisclosed("~$263M+ (latest disclosed Apr 2023)")).toBe(true);
  });
});

describe("normalizeToken", () => {
  it("maps None/Unknown to null", () => {
    expect(normalizeToken("None")).toBeNull();
    expect(normalizeToken("Unknown")).toBeNull();
    expect(normalizeToken("None confirmed")).toBeNull();
    expect(normalizeToken("PONS")).toBe("PONS");
  });
});

describe("toProject", () => {
  const p = toProject(baseRow);
  it("derives id, lists and groups", () => {
    expect(p.id).toBe("test-dex");
    expect(p.fundingTypes).toEqual(["Corporate/parent", "VC-backed"]);
    expect(p.tractionSources).toEqual(["https://a.example", "https://b.example"]);
    expect(p.statusGroup).toBe("Mainnet");
    expect(p.subcategory).toBeNull();
  });
  it("keeps blank metrics null and computes capture", () => {
    expect(p.tvl).toBe(1234567);
    expect(p.volume).toBeNull();
    expect(p.revenueCapture).toBeCloseTo(0.9);
    expect(p.hasTraction).toBe(true);
  });
  it("flags disclosure and token", () => {
    expect(p.amountDisclosed).toBe(true);
    expect(p.token).toBeNull();
    expect(p.tokenRaw).toBe("None");
  });
  it("rejects unknown category values", () => {
    expect(() => toProject({ ...baseRow, "Native Chain": "Mars" })).toThrow(/Native Chain/);
  });
  it("has no traction when every metric is blank", () => {
    const q = toProject({
      ...baseRow,
      "TVL on Base (USD)": "",
      "30d Fees (USD)": "",
      "30d Revenue (USD)": "",
    });
    expect(q.hasTraction).toBe(false);
    expect(q.revenueCapture).toBeNull();
  });
});

describe("toEvent", () => {
  it("links project refs when they exist", () => {
    const ids = new Map([["pons", "pons"]]);
    const e = toEvent(
      {
        Date: "2026-09-04",
        "Event Type": "Funding",
        Title: "Uniswap buys PONS stake",
        Projects: "Pons; Uniswap",
        "Amount (USD)": "",
        "Amount Note": "Undisclosed",
        Detail: "x",
        "Source URL": "https://example.com",
      },
      2,
      ids,
    );
    expect(e.projects).toEqual(["Pons", "Uniswap"]);
    expect(e.projectIds).toEqual(["pons"]);
    expect(e.amount).toBeNull();
  });
});

describe("parseMemoInsights", () => {
  it("reads the numbered list under the insights heading", () => {
    const md = `# Memo\n\n## Security\n- nope\n\n## Ecosystem insights (from the dataset)\n\n1. Extreme concentration. Top 3 hold 80%.\n2. Natives earn, imports hold capital. Detail here.\n\n## After\n3. not this\n`;
    const out = parseMemoInsights(md);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ n: 1, title: "Extreme concentration", text: "Extreme concentration. Top 3 hold 80%." });
    expect(out[1].title).toBe("Natives earn, imports hold capital");
  });
});

describe("slugify", () => {
  it("handles punctuation", () => {
    expect(slugify("Aero (Aerodrome)")).toBe("aero-aerodrome");
    expect(slugify("up.")).toBe("up");
    expect(slugify("letscash.fun (formerly cashcat.fun)")).toBe("letscash-fun-formerly-cashcat-fun");
  });
});
