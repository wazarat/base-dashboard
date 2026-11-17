import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_SENTINELS, findSentinels, scan, slugOf } from "../scripts/check-public-bundle.mjs";

function folder(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-check-"));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

describe("public bundle check", () => {
  const rounds = [{ leadInvestors: ["Secret Ventures"], otherInvestors: ["Open Capital", "Tiny"] }];

  it("takes gated investor names that no public file or source file mentions, plus the fixed names", () => {
    const s = findSentinels(rounds, ['{"name":"Open Capital"}'], ["const alias = 'x';"]);
    expect(s).toContain("Secret Ventures");
    expect(s).not.toContain("Open Capital");
    expect(s).not.toContain("Tiny");
    for (const f of FIXED_SENTINELS) expect(s).toContain(f);
    // A gated name inside a URL path is caught too.
    expect(slugOf("Ribbit Capital")).toBe("ribbit-capital");
    expect(s).toContain("ribbit-capital");
    const planted = folder({ "chunks/b.js": 'var u="https://news.example/2025/raise-ribbit-capital-haun";' });
    expect(scan([planted], s)).toEqual([expect.objectContaining({ sentinel: "ribbit-capital" })]);
    expect(findSentinels(rounds, [], ["'Secret Ventures'"])).not.toContain("Secret Ventures");
  });

  it("fails on a planted sentinel and passes a clean folder", () => {
    const dirty = folder({ "chunks/a.js": 'var x="Ribbit Capital";', "page.html": "<p>hello</p>" });
    expect(scan([dirty], ["Ribbit Capital"])).toEqual([expect.objectContaining({ sentinel: "Ribbit Capital" })]);
    const clean = folder({ "chunks/a.js": 'var x="hello";', "img.png": "Ribbit Capital" });
    expect(scan([clean], ["Ribbit Capital"])).toEqual([]);
    expect(scan([dirty], ["Ribbit Capital"], (f) => f.endsWith(".js"))).toEqual([]);
  });
});
