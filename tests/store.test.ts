import { describe, expect, it } from "vitest";
import { appendDated, mergeHourly, stableJson, upsertSeries } from "../scripts/lib/store";

describe("upsertSeries", () => {
  const today = "2026-11-08";
  it("appends new dates and sorts", () => {
    const out = upsertSeries([["2026-11-05", 1]], [["2026-11-07", 3], ["2026-11-06", 2]], { today });
    expect(out).toEqual([["2026-11-05", 1], ["2026-11-06", 2], ["2026-11-07", 3]]);
  });
  it("is idempotent", () => {
    const inc: [string, number][] = [["2026-11-06", 2], ["2026-11-07", 3]];
    const once = upsertSeries([], inc, { today });
    expect(upsertSeries(once, inc, { today })).toEqual(once);
  });
  it("drops the partial current day for flows, keeps it for stocks", () => {
    expect(upsertSeries([], [[today, 5]], { today })).toEqual([]);
    expect(upsertSeries([], [[today, 5]], { today, allowToday: true })).toEqual([[today, 5]]);
  });
  it("drops future dates and non-finite values", () => {
    expect(upsertSeries([], [["2026-11-09", 1], ["2026-11-01", Number.NaN]], { today })).toEqual([]);
  });
  it("revises recent days but freezes older ones", () => {
    const existing: [string, number][] = [["2026-10-01", 10], ["2026-11-06", 20]];
    const out = upsertSeries(existing, [["2026-10-01", 99], ["2026-11-06", 21]], { today, revisionDays: 3 });
    expect(out).toEqual([["2026-10-01", 10], ["2026-11-06", 21]]);
  });
});

describe("appendDated / mergeHourly / stableJson", () => {
  it("replaces the same date", () => {
    const out = appendDated<[string, number]>([["2026-11-07", 1]], ["2026-11-07", 2]);
    expect(out).toEqual([["2026-11-07", 2]]);
  });
  it("dedupes hourly rows and prunes old ones", () => {
    const now = 1_800_000_000;
    const out = mergeHourly([[now - 200 * 86_400, 1, 1], [now - 3600, 2, 2]], [[now - 3600, 3, 3], [now, 4, 4]], { retainDays: 180, now });
    expect(out).toEqual([[now - 3600, 3, 3], [now, 4, 4]]);
  });
  it("writes sorted keys one per line", () => {
    expect(stableJson({ b: [1], a: { x: 1 } })).toBe('{\n"a":{"x":1},\n"b":[1]\n}\n');
    expect(stableJson([[1, 2], [3, 4]])).toBe("[\n[1,2],\n[3,4]\n]\n");
  });
});
