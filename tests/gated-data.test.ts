import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAS_EVENTS } from "./helpers";
import { GATED_HEADERS, gatedResponse, serverAuthEnabled } from "@/lib/gated-response";
import { GATED_DEFAULTS, PUBLIC_LIVE_FIELDS, PUBLIC_PROJECT_FIELDS, splitEvents, splitProject } from "@/lib/public-fields";
import type { EcosystemEvent, Project } from "@/lib/types";

const authMock = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

const GENERATED = path.resolve(__dirname, "..", "src", "data", "generated");
const GATED_FILE = path.resolve(__dirname, "..", "src", "data", "gated", "gated.json");

describe("public and gated split", () => {
  it("keeps only allowlisted fields public, and sends any new field to the gated set", () => {
    const p = { id: "x", name: "X", tvl: 5, investors: ["Ribbit Capital"], brandNewField: 1, live: { asOf: "d", slugs: ["x"], change: {}, tvl: 9, psRatio: 2 } } as unknown as Project;
    const { public: pub, gated } = splitProject(p);
    expect(pub).toEqual({ id: "x", name: "X", tvl: 5, live: { asOf: "d", slugs: ["x"], change: {} } });
    expect(gated).toEqual({ investors: ["Ribbit Capital"], brandNewField: 1, live: { tvl: 9, psRatio: 2 } });
  });

  it("blanks a Funding event's detail and source in public and keeps both in the gated map", () => {
    const events = [
      { id: "f1", type: "Funding", title: "Raise", detail: "Led by Ribbit Capital", sourceUrl: "https://news.example/raise-ribbit-capital" },
      { id: "l1", type: "Launch", title: "Mainnet", detail: "Live", sourceUrl: "https://blog.example/mainnet" },
    ] as unknown as EcosystemEvent[];
    const { public: pub, gated } = splitEvents(events);
    expect(pub.map((e) => [e.detail, e.sourceUrl])).toEqual([
      [null, null],
      ["Live", "https://blog.example/mainnet"],
    ]);
    expect(gated).toEqual({ f1: { detail: "Led by Ribbit Capital", sourceUrl: "https://news.example/raise-ribbit-capital" } });
  });

  it.skipIf(!HAS_EVENTS)("the built public events carry no Funding source or detail, and no investor slug", () => {
    const events = JSON.parse(fs.readFileSync(path.join(GENERATED, "events.json"), "utf8")) as EcosystemEvent[];
    const funding = events.filter((e) => e.type === "Funding");
    expect(funding.length).toBeGreaterThan(0);
    for (const e of funding) expect([e.detail, e.sourceUrl]).toEqual([null, null]);
    expect(JSON.stringify(events)).not.toContain("ribbit-capital");
  });

  it("the built public files carry no gated project key and no gated name", () => {
    const projects = JSON.parse(fs.readFileSync(path.join(GENERATED, "projects.json"), "utf8")) as Record<string, unknown>[];
    expect(projects.length).toBeGreaterThan(100);
    const allowed = new Set<string>(PUBLIC_PROJECT_FIELDS);
    for (const p of projects) {
      for (const k of Object.keys(p)) expect(allowed.has(k), `public key ${k}`).toBe(true);
      const live = p.live as Record<string, unknown> | null | undefined;
      if (live) for (const k of Object.keys(live)) expect((PUBLIC_LIVE_FIELDS as readonly string[]).includes(k), `public live key ${k}`).toBe(true);
    }
    for (const k of Object.keys(GATED_DEFAULTS)) expect(projects.some((p) => k in p), `gated key ${k}`).toBe(false);
    for (const f of fs.readdirSync(GENERATED).filter((n) => n.endsWith(".json"))) {
      expect(fs.readFileSync(path.join(GENERATED, f), "utf8"), f).not.toContain("Ribbit Capital");
    }
    for (const gone of ["rounds.json", "investors.json", "leaders.json", "insights.json", "stocks.json"]) expect(fs.existsSync(path.join(GENERATED, gone)), gone).toBe(false);
  });
});

describe("gated responses", () => {
  it("answers 401 without a session when the wall is on, and 200 with one, always private", async () => {
    const denied = gatedResponse(null, true, { secret: 1 });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "login required" });
    const ok = gatedResponse("user_1", true, { secret: 1 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ secret: 1 });
    for (const r of [denied, ok]) {
      expect(r.headers.get("cache-control")).toBe(GATED_HEADERS["Cache-Control"]);
      expect(r.headers.get("vary")).toBe("Cookie");
    }
    expect(gatedResponse(null, false, { secret: 1 }).status).toBe(200);
  });

  it("turns the wall on only with both Clerk keys", () => {
    expect(serverAuthEnabled({})).toBe(false);
    expect(serverAuthEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk" })).toBe(false);
    expect(serverAuthEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk" })).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(GATED_FILE))("the /api/data route handlers", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
  });

  it("/api/data/gated returns 401 and no data without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/data/gated/route");
    const res = await GET();
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain("Ribbit Capital");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("/api/data/gated returns the gated set to a signed-in reader", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const { GET } = await import("@/app/api/data/gated/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rounds: unknown[]; projects: Record<string, unknown> };
    expect(body.rounds.length).toBeGreaterThan(0);
    expect(Object.keys(body.projects).length).toBeGreaterThan(100);
  });

});

describe("loading the gated set right after an in-page login", () => {
  it("retries a 401 while signed in, and gives up without a session", async () => {
    vi.resetModules();
    const data = await import("@/lib/data");
    const gated = JSON.parse(fs.readFileSync(GATED_FILE, "utf8"));
    const answers = [401, 401, 200];
    const seen: number[] = [];
    const fetchImpl = (async () => {
      const s = answers.shift() ?? 200;
      seen.push(s);
      return s === 200 ? Response.json(gated) : new Response("", { status: s });
    }) as unknown as typeof fetch;
    await data.loadGated({ signedIn: true, retryMs: [0, 0, 0], fetchImpl });
    expect(seen).toEqual([401, 401, 200]);
    expect(data.gatedStatus()).toBe("ready");

    vi.resetModules();
    const fresh = await import("@/lib/data");
    const calls: number[] = [];
    await fresh.loadGated({ fetchImpl: (async () => (calls.push(401), new Response("", { status: 401 }))) as unknown as typeof fetch });
    expect(calls).toEqual([401]);
    expect(fresh.gatedStatus()).toBe("denied");
  });
});
