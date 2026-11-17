import { describe, expect, it } from "vitest";
import { tallyCorrectUrl } from "@/lib/env";
import { diffSubmission, parseSubmission } from "../scripts/review";

describe("forms", () => {
  it("prefills the correction form with project and page, and stays hidden without a base", () => {
    expect(tallyCorrectUrl(null, "Fables", "https://x/")).toBeNull();
    const u = new URL(tallyCorrectUrl("https://tally.so/r/abc", "Clutch Markets (StonkBrokers)", "https://atlas/?project=clutch")!);
    expect(u.searchParams.get("project")).toBe("Clutch Markets (StonkBrokers)");
    expect(u.searchParams.get("page")).toBe("https://atlas/?project=clutch");
  });
  it("maps Tally headers and diffs a correction against the current row", () => {
    const sub = parseSubmission({ "Submission ID": "1", project: "Fables", page: "https://atlas/", "Which field is wrong": "Website", "Correct value": "https://fables.xyz", "Evidence URL": "https://docs" });
    expect(sub.kind).toBe("correction");
    const d = diffSubmission(sub, { "Project/Company Name": "Fables", Website: "https://old.example" });
    expect(d).toEqual([{ field: "Website", submitted: "https://fables.xyz", current: "https://old.example", changed: true }]);
  });
  it("treats a submission without a field as a new project", () => {
    const sub = parseSubmission({ "Project name": "NewCo", Website: "https://newco.xyz", Sector: "Launchpads", "Native chain": "Base native", "Evidence URL": "https://e" });
    expect(sub.kind).toBe("new");
    const d = diffSubmission(sub, null);
    expect(d.find((x) => x.field === "Website")).toMatchObject({ submitted: "https://newco.xyz", current: null, changed: true });
  });
});
