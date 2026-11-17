import { describe, expect, it } from "vitest";
import { allowed, compareChange, decodePending, encodePending, GATED_PATHS, isGatedPath, PUBLIC_PATHS, replayPending, unclassifiedTabs } from "@/lib/gate";
import { HIDDEN_TABS, NAV, NAV_ALL } from "@/lib/nav";

describe("gate table", () => {
  it("keeps Overview, Methodology and Compare public and gates every other tab, hidden ones included", () => {
    for (const p of ["/", "/methodology/", "/compare/"]) expect(isGatedPath(p)).toBe(false);
    for (const p of ["/sectors/", "/traction/", "/funding/", "/explorer/", "/security/", "/investors/"]) expect(isGatedPath(p)).toBe(true);
    expect(isGatedPath("/explorer")).toBe(true);
    expect(isGatedPath("/funding/?fundingType=VC-backed")).toBe(true);
    expect(unclassifiedTabs()).toEqual([]);
    const classified: string[] = [...PUBLIC_PATHS, ...GATED_PATHS].filter((h) => h !== "/methodology/");
    expect(classified.sort()).toEqual(NAV_ALL.map((n) => n.href as string).sort());
  });

  it("allows everything when signed in or when the wall is off", () => {
    expect(allowed({ path: "/funding/" }, false, true)).toBe(false);
    expect(allowed({ path: "/" }, false, true)).toBe(true);
    expect(allowed({ action: "compare-add" }, false, true)).toBe(false);
    expect(allowed({ action: "project-detail" }, false, true)).toBe(false);
    expect(allowed({ path: "/funding/" }, true, true)).toBe(true);
    expect(allowed({ action: "compare-add" }, true, true)).toBe(true);
    expect(allowed({ path: "/funding/" }, false, false)).toBe(true);
    expect(allowed({ action: "project-detail" }, false, false)).toBe(true);
  });
});

describe("add to compare while logged out", () => {
  it("lets one project in, and asks for login (saving the addition) when a second would make a comparison", () => {
    expect(compareChange([], ["a"], false)).toEqual({ write: ["a"] });
    expect(compareChange(["a"], ["a", "b"], false)).toEqual({ login: { type: "compare-add", id: "b" } });
    expect(compareChange(["a"], ["a", "b", "c"], false)).toEqual({ login: { type: "compare-add", id: "b" } });
    expect(compareChange(["a"], ["a", "b"], true)).toEqual({ write: ["a", "b"] });
  });

  it("never asks for login to remove or reorder", () => {
    expect(compareChange(["a", "b"], ["a"], false)).toEqual({ write: ["a"] });
    expect(compareChange(["a", "b"], ["b", "a"], false)).toEqual({ write: ["b", "a"] });
  });
});

describe("return to the action after login", () => {
  it("replays the saved Add to compare once, and ignores junk", () => {
    const raw = encodePending({ type: "compare-add", id: "uniswap" });
    expect(decodePending(raw)).toEqual({ type: "compare-add", id: "uniswap" });
    expect(replayPending(raw, () => false)).toBe("uniswap");
    expect(replayPending(raw, (id) => id === "uniswap")).toBeNull();
    expect(replayPending("not json", () => false)).toBeNull();
    expect(replayPending(JSON.stringify({ type: "other", id: "x" }), () => false)).toBeNull();
    expect(replayPending(null, () => false)).toBeNull();
  });
});

describe("hidden tabs", () => {
  it("are absent from the nav while their routes are still classified and served", () => {
    expect(HIDDEN_TABS).toEqual(["/security/", "/investors/"]);
    for (const h of HIDDEN_TABS) {
      expect(NAV.map((n) => n.href)).not.toContain(h);
      expect(isGatedPath(h)).toBe(true);
    }
  });
});
