import { describe, expect, it } from "vitest";
import { scanSource } from "../scripts/check-copy.mjs";

const tags = (code: string, file = "x.tsx") => scanSource(code, file).map((h) => h.tag);

describe("copy rules", () => {
  it("flags a colon followed by whitespace in a string literal", () => {
    expect(tags('const a = "Business model: fees";')).toEqual(["colon"]);
  });
  it("leaves Tailwind classes, times and URLs alone", () => {
    expect(tags('const c = "md:flex sm:hidden"; const t = "12:30"; const u = "https://canhav.com";')).toEqual([]);
  });
  it("treats a template head ending in a colon as a code join, not copy", () => {
    expect(tags("const k = `${a}:${b}`;")).toEqual([]);
  });
  it("flags a template chunk with a colon and a space", () => {
    expect(tags("const k = `Top: ${n} projects`;")).toEqual(["colon"]);
  });
  it("flags a trailing colon on a final chunk", () => {
    expect(tags('const label = "Largest by TVL:";')).toEqual(["colon"]);
  });
  it("flags JSX text", () => {
    expect(tags("const el = <p>Sources: DefiLlama</p>;")).toEqual(["colon"]);
  });
  it("flags em dashes", () => {
    expect(tags('const d = "no data — yet";')).toEqual(["em"]);
  });
  it("skips lines marked copy-ok and ignores comments", () => {
    expect(tags('// note: this is a comment\nconst m = "(prefers-color-scheme: light)"; // copy-ok')).toEqual([]);
  });
});

describe("tone rule", () => {
  it("allows only the two text tones", () => {
    expect(tags('const a = "text-ink-50 font-medium"; const b = "text-xs text-ink-300";')).toEqual([]);
  });
  it("flags other ink steps, muted-foreground and hover variants", () => {
    expect(tags('const a = "text-ink-500";')).toEqual(["tone"]);
    expect(tags('const a = "text-xs text-ink-400";')).toEqual(["tone"]);
    expect(tags('const a = "text-muted-foreground";')).toEqual(["tone"]);
    expect(tags('const a = "text-ink-300 hover:text-ink-200";')).toEqual(["tone"]);
  });
  it("flags dimmed text but not disabled controls or non-text colours", () => {
    expect(tags('const a = "text-ink-300/70";')).toEqual(["tone"]);
    expect(tags('const a = "opacity-60 text-ink-300";')).toEqual(["tone"]);
    expect(tags('const a = "text-ink-300 disabled:opacity-50";')).toEqual([]);
    expect(tags('const a = "bg-ink-500 border-ink-400 decoration-ink-500";')).toEqual([]);
  });
});
