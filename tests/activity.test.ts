import { describe, expect, it } from "vitest";
import { dailyTxns, projectActivity, type ActivityStore } from "@/lib/activity";
import { foldDays, parseTransactionsPage } from "../scripts/fetch/blockscout";

const store: ActivityStore = {
  counters: {
    "0xa": [["2026-11-05", 1000, 0, 0], ["2026-11-06", 1100, 0, 0], ["2026-11-07", 1150, 0, 0], ["2026-11-08", 1200, 0, 0]],
  },
  tokens: { "0xa": [["2026-11-08", 321, 1000, 5000, 1]] },
  activity: { "0xa": { days: [["2026-11-01", 40, 12], ["2026-11-05", 90, 30]], next: null, done: true, skippedLarge: false, pages: 3 } },
};

describe("activity", () => {
  it("prefers backfilled days and fills the rest from counter differences attributed to the previous day", () => {
    expect(dailyTxns("0xa", store)).toEqual([["2026-11-01", 40], ["2026-11-05", 90], ["2026-11-06", 50], ["2026-11-07", 50]]);
  });
  it("aggregates a project over its contracts with 7d windows and holders", () => {
    const a = projectActivity([{ address: "0xa", role: "token" }], store, "2026-11-07")!;
    expect(a.txns24h).toBe(50);
    expect(a.txns7d).toBe(230);
    expect(a.uniqueSenders7d).toBe(42);
    expect(a.holders).toBe(321);
    expect(a.activityAsOf).toBe("2026-11-07");
    expect(projectActivity([], store, "2026-11-07")).toBeNull();
  });
  it("parses a transactions page and folds it into days", () => {
    const page = parseTransactionsPage({
      items: [
        { hash: "0x1", timestamp: "2026-11-08T16:29:10.000000Z", from: { hash: "0xAA" }, status: "ok" },
        { hash: "0x2", timestamp: "2026-11-08T01:00:00.000000Z", from: { hash: "0xaa" }, status: "ok" },
        { hash: "0x3", timestamp: "2026-11-07T23:59:59.000000Z", from: { hash: "0xbb" }, status: "error" },
      ],
      next_page_params: { block_number: 1, index: 2 },
    });
    expect(page.next).toEqual({ block_number: "1", index: "2" });
    const days = foldDays(page.rows);
    expect(days.get("2026-11-08")).toMatchObject({ txns: 2 });
    expect(days.get("2026-11-08")!.senders.size).toBe(1);
    expect(days.get("2026-11-07")!.txns).toBe(1);
  });
});
