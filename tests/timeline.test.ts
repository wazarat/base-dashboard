import { describe, expect, it } from "vitest";
import { HAS_EVENTS } from "./helpers";
import { chartTableToCsv } from "@/components/atlas/chart-table";
import { events } from "@/lib/data";
import { TIMELINE_DEFAULT_START } from "@/lib/site";
import { eventTable, markerSize, monthTicks, splitEarlier, timelineSummary } from "@/lib/timeline";

describe.skipIf(!HAS_EVENTS)("timeline", () => {
  it("splits events before 2025 from the default view", () => {
    const { shown, earlier } = splitEarlier(events, TIMELINE_DEFAULT_START);
    const before = events.filter((e) => e.date < TIMELINE_DEFAULT_START).length;
    expect(before).toBeGreaterThan(0);
    expect(earlier).toHaveLength(before);
    expect(shown).toHaveLength(events.length - before);
    expect(earlier.every((e) => e.date < TIMELINE_DEFAULT_START)).toBe(true);
  });
  it("writes the summary points from the data, with no dates", () => {
    const s = timelineSummary(events, TIMELINE_DEFAULT_START);
    expect(s.lead).toBeUndefined();
    expect(s.points[0]).toBe(`${events.length} events recorded.`);
    const byType = new Map<string, number>();
    for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    const [topType, topCount] = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])[0];
    expect(s.points.some((p) => p.endsWith(`lead with ${topCount}.`))).toBe(true);
    expect(byType.get(topType)).toBe(topCount);
    expect(s.points.at(-1)).toBe(`${splitEarlier(events, TIMELINE_DEFAULT_START).earlier.length} sit behind Show earlier events.`);
    expect(s.points.join(" ")).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b20\d\d\b/);
    expect(timelineSummary([], TIMELINE_DEFAULT_START)).toEqual({ points: ["No events recorded."] });
    expect(timelineSummary(events.filter((e) => e.date >= TIMELINE_DEFAULT_START), TIMELINE_DEFAULT_START).points.join(" ")).not.toContain("Show earlier events");
  });
  it("shows four columns and keeps the amount, detail and source for the popup and the CSV", () => {
    const t = eventTable(events);
    expect(t.rows).toHaveLength(events.length);
    expect(String(t.rows[0].date) >= String(t.rows[t.rows.length - 1].date)).toBe(true);
    expect(t.columns.map((c) => c.label)).toEqual(["Date", "Type", "Event", "Projects"]);
    expect(t.columns.find((c) => c.primary)?.key).toBe("title");
    expect(t.exportColumns!.map((c) => c.label)).toEqual(["Date", "Type", "Event", "Projects", "Amount", "Amount note", "Detail", "Source"]);
    expect(JSON.stringify(t)).not.toContain("—");
    const amount = t.exportColumns!.find((c) => c.key === "amount")!;
    expect(amount.format!(null)).toBe("undisclosed");
    // Every row can open its popup, and a link that is not direct never reaches the CSV.
    expect(t.rows.every((r) => typeof r.id === "string" && events.some((e) => e.id === r.id))).toBe(true);
    expect(t.rows.some((r) => String(r.source ?? "").includes("x.com/RobinHubHB"))).toBe(false);
    expect(chartTableToCsv(t).split("\n")[0]).toContain("Amount note");
    // Every recorded event has a direct source today; one that only names a profile is exported without a link.
    expect(chartTableToCsv(t)).not.toContain("No direct source yet");
    const withProfile = eventTable([...events, { ...events[0], id: "profile-only", title: "Profile only", sourceUrl: "https://x.com/RobinHubHB" }]);
    const row = withProfile.rows.find((r) => r.id === "profile-only")!;
    expect(row.source).toBeNull();
    expect(chartTableToCsv(withProfile)).toContain("No direct source yet");
    expect(chartTableToCsv(withProfile)).not.toContain("x.com/RobinHubHB");
  });
  it("scales marker area on a log scale between the smallest and largest amount", () => {
    expect(markerSize(null, 1e5, 1e8)).toBe(30);
    expect(markerSize(1e5, 1e5, 1e8)).toBe(60);
    expect(markerSize(1e8, 1e5, 1e8)).toBe(420);
    expect(markerSize(1e6, 1e5, 1e8)).toBeGreaterThan(markerSize(1e5, 1e5, 1e8));
    expect(markerSize(1e6, 1e5, 1e8)).toBeLessThan(markerSize(1e7, 1e5, 1e8));
  });
  it("ticks monthly up to 14 months and quarterly beyond", () => {
    const jan = Date.UTC(2026, 0, 1);
    const monthly = monthTicks(jan, Date.UTC(2026, 11, 31));
    expect(monthly).toHaveLength(12);
    const quarterly = monthTicks(Date.UTC(2025, 10, 1), Date.UTC(2027, 10, 1));
    expect(quarterly.every((t) => new Date(t).getUTCMonth() % 3 === 0)).toBe(true);
    expect(quarterly.length).toBeLessThan(12);
  });
});
