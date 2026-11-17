import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHOW_NOTES } from "@/lib/notes";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(name) ? [full] : [];
  });
}

describe("research notes", () => {
  it("are off unless the build asks for them", () => {
    expect(SHOW_NOTES).toBe(false);
  });

  it("never reach a chart card as a hand-written takeaway or a public footer", () => {
    const offenders: string[] = [];
    for (const file of sources(path.join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8");
      // A takeaway must be an expression built from the data, so a plain string attribute is a hand-written line.
      if (/\btakeaway="/.test(text)) offenders.push(`${file} has a string takeaway`);
      if (/footer=\{[^}]*<TvlNote/.test(text)) offenders.push(`${file} shows TvlNote in a public footer`);
    }
    expect(offenders).toEqual([]);
  });
});
