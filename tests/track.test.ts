import { describe, expect, it } from "vitest";
import metaJson from "@/data/generated/meta.json";
import { EVENT_PROPS, EVENTS, eventProps, FILTER_KEYS, LOGIN_TRIGGERS, pageOf, PAGES, signupTrigger, type EventName } from "@/lib/track";

const PII = [
  "someone@example.com",
  "Jane Doe",
  "user_2abcDEF123",
  "https://robinhood.canhav.com/?project=uniswap",
  "uniswap",
  "Ribbit Capital",
  "0x1234567890abcdef1234567890abcdef12345678",
  "  in ",
  "",
  null,
  undefined,
  42,
  { email: "someone@example.com" },
];

const allValues = (o: Record<string, string | number>) => Object.values(o).map(String);

describe("analytics events", () => {
  it("are exactly the owner's eight events", () => {
    expect(Object.values(EVENTS).sort()).toEqual(
      ["compare_add", "correction_click", "filter_use", "login_prompt_shown", "project_open", "signup_complete", "submit_project_click", "tab_view"].sort(),
    );
    expect(LOGIN_TRIGGERS).toEqual(["tab", "compare", "project", "header", "event", "sector"]);
  });

  it("keep at most two properties, each from its closed set", () => {
    const sector = (metaJson as { sectors: string[] }).sectors[0];
    const good: Record<EventName, Record<string, unknown>> = {
      tab_view: { tab: "funding", auth: "out" },
      project_open: { sector, auth: "in" },
      compare_add: { count: 2, auth: "out" },
      filter_use: { filter: "q", page: "explorer" },
      login_prompt_shown: { trigger: "compare" },
      signup_complete: { trigger: "tab" },
      correction_click: { page: "overview" },
      submit_project_click: { page: "explorer" },
    };
    for (const name of Object.values(EVENTS)) {
      const out = eventProps(name, { ...good[name], extra: "someone@example.com", userId: "user_2abc", name: "Jane Doe" });
      expect(Object.keys(out).length).toBeLessThanOrEqual(2);
      expect(Object.keys(out)).toEqual(EVENT_PROPS[name].filter((k) => k in good[name]));
      expect(out).toEqual(good[name]);
    }
  });

  it("never send an email, a name, a user id, a URL or typed text, whatever is passed", () => {
    for (const name of Object.values(EVENTS)) {
      for (const bad of PII) {
        const raw = Object.fromEntries(["tab", "auth", "sector", "count", "filter", "page", "trigger"].map((k) => [k, bad]));
        const out = eventProps(name, raw);
        expect(out, `${name} with ${JSON.stringify(bad)}`).toEqual({});
        for (const v of allValues(out)) expect(v).not.toMatch(/@|user_|https?:|0x/);
      }
    }
  });

  it("filter_use carries the filter's key, never what was typed", () => {
    expect(eventProps("filter_use", { filter: "pantera capital", page: "explorer" })).toEqual({ page: "explorer" });
    for (const k of FILTER_KEYS) expect(eventProps("filter_use", { filter: k, page: "overview" })).toEqual({ filter: k, page: "overview" });
  });

  it("name pages by tab, and anything unknown as other", () => {
    expect(pageOf("/")).toBe("overview");
    expect(pageOf("/funding/")).toBe("funding");
    expect(pageOf("/explorer?q=x")).toBe("explorer");
    expect(pageOf("/methodology")).toBe("methodology");
    expect(pageOf("/someone@example.com/")).toBe("other");
    expect(PAGES).toContain("compare");
  });

  it("count a sign-up only for an account created after this session's prompt", () => {
    const at = Date.UTC(2026, 10, 11, 12);
    const raw = JSON.stringify({ trigger: "compare", at });
    expect(signupTrigger(raw, at + 60_000)).toBe("compare");
    expect(signupTrigger(raw, at - 2 * 60_000)).toBe("compare"); // browser clock a little ahead
    expect(signupTrigger(raw, Date.UTC(2025, 0, 1))).toBeNull(); // a returning account
    expect(signupTrigger(null, at)).toBeNull();
    expect(signupTrigger(JSON.stringify({ trigger: "someone@example.com", at }), at + 1)).toBeNull();
    expect(signupTrigger("not json", at)).toBeNull();
  });
});
