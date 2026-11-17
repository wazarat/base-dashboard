import { describe, expect, it } from "vitest";
import { shouldShowToggle } from "@/components/atlas/clamp";

describe("Clamp toggle", () => {
  it("shows the control only when content is hidden", () => {
    expect(shouldShowToggle(60, 48)).toBe(true);
    expect(shouldShowToggle(48, 48)).toBe(false);
  });
  it("tolerates a one-pixel rounding difference", () => {
    expect(shouldShowToggle(49, 48)).toBe(false);
    expect(shouldShowToggle(50, 48)).toBe(true);
  });
});
