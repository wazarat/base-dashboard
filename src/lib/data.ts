/**
 * The app's data. Public data (src/data/generated) ships to every visitor; gated
 * data (src/data/gated) reaches the browser only through /api/data/gated, for a
 * signed-in reader (owner prompt, login wall phase 2). Gated values start as
 * neutral defaults and `hydrateGated` fills the same objects in place, so code can
 * keep importing `projects`, `rounds` and friends; components that show gated data
 * re-render through `useGatedData()` (src/lib/use-gated.ts).
 */
import chainJson from "@/data/generated/chain.json";
import eventsJson from "@/data/generated/events.json";
import metaJson from "@/data/generated/meta.json";
import projectsJson from "@/data/generated/projects.json";
import type { LlamaHack, NewlyDetected } from "./history-types";
import { GATED_DEFAULTS, GATED_LIVE_DEFAULTS, type GatedEventFields, type GatedProjectFields } from "./public-fields";
import type { ChainData, EcosystemEvent, Investor, Leader, MemoInsight, Meta, Project, Round } from "./types";

export const projects = projectsJson as unknown as Project[];
for (const p of projects) {
  for (const [k, v] of Object.entries(GATED_DEFAULTS)) if (!(k in p)) (p as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [] : v;
  if (p.live) Object.assign(p.live, { ...GATED_LIVE_DEFAULTS, ...p.live });
}
export const events = eventsJson as unknown as EcosystemEvent[];
export const meta = metaJson as unknown as Meta;
export const chainData = chainJson as unknown as ChainData;

// Gated collections: empty until a signed-in reader's data arrives.
export const leaders: Leader[] = [];
export const memoInsights: MemoInsight[] = [];
export const rounds: Round[] = [];
export const investors: Investor[] = [];
export const hacks: LlamaHack[] = [];
export const newlyDetected: { items: NewlyDetected[]; unmatchedCsv: string[]; unmatchedMap: string[] } = { items: [], unmatchedCsv: [], unmatchedMap: [] };

/** The shape /api/data/gated returns (written by scripts/build-data.ts as src/data/gated/gated.json). */
export interface GatedPayload {
  projects: Record<string, GatedProjectFields>;
  eventDetails: Record<string, GatedEventFields>;
  leaders: Leader[];
  insights: MemoInsight[];
  rounds: Round[];
  investors: Investor[];
  hacks: LlamaHack[];
  newlyDetected: { items: NewlyDetected[]; unmatchedCsv: string[]; unmatchedMap: string[] };
}

const byId = new Map(projects.map((p) => [p.id, p]));
export function projectById(id: string | null | undefined): Project | undefined {
  return id ? byId.get(id) : undefined;
}

export const leadersBySector = new Map<string, Leader[]>();
const investorById = new Map<string, Investor>();

function replace<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

// ---- gated store -------------------------------------------------------------

export type GatedStatus = "idle" | "loading" | "ready" | "denied" | "error";
let status: GatedStatus = "idle";
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  for (const l of listeners) l();
}

/** Fill every gated field and collection in place. Safe to call once; later calls replace the data. */
export function hydrateGated(g: GatedPayload): void {
  for (const p of projects) {
    const extra = g.projects[p.id];
    if (!extra) continue;
    const { live, snapshot, ...rest } = extra as { live?: Record<string, unknown>; snapshot?: Record<string, unknown> } & Record<string, unknown>;
    Object.assign(p, rest);
    if (live && p.live) Object.assign(p.live, live);
    if (snapshot && p.snapshot) Object.assign(p.snapshot, snapshot);
  }
  for (const e of events) {
    const d = g.eventDetails[e.id];
    if (d) Object.assign(e, { detail: d.detail, sourceUrl: d.sourceUrl });
  }
  replace(leaders, g.leaders);
  replace(memoInsights, g.insights);
  replace(rounds, g.rounds);
  replace(investors, g.investors);
  replace(hacks, g.hacks);
  Object.assign(newlyDetected, g.newlyDetected);
  leadersBySector.clear();
  for (const l of leaders) {
    const arr = leadersBySector.get(l.sector) ?? [];
    arr.push(l);
    leadersBySector.set(l.sector, arr);
  }
  for (const arr of leadersBySector.values()) arr.sort((a, b) => a.rank - b.rank);
  investorById.clear();
  for (const i of investors) investorById.set(i.id, i);
  status = "ready";
  emit();
}

export function setGatedStatus(s: GatedStatus): void {
  if (status === s) return;
  status = s;
  emit();
}

export function gatedStatus(): GatedStatus {
  return status;
}

export function subscribeGated(on: () => void): () => void {
  listeners.add(on);
  return () => listeners.delete(on);
}

export function gatedVersion(): number {
  return version;
}

let inflight: Promise<void> | null = null;
/** Waits before each retry of a 401 while the browser already reports a session (the cookie can land a moment later). */
export const SESSION_RETRY_MS = [400, 1000, 2500] as const;
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch the gated set once. A 401 leaves everything gated. Right after an in-page login the browser knows it is
 * signed in a moment before the session cookie reaches the server, so with `signedIn` a 401 is retried after
 * each wait in `retryMs` before giving up; without it (wall off, or a logged-out reader) there is no retry.
 */
export function loadGated(opts: { signedIn?: boolean; retryMs?: readonly number[]; fetchImpl?: typeof fetch } = {}): Promise<void> {
  if (status === "ready") return Promise.resolve();
  const doFetch = opts.fetchImpl ?? fetch;
  const waits = opts.signedIn ? (opts.retryMs ?? SESSION_RETRY_MS) : [];
  inflight ??= (async () => {
    setGatedStatus("loading");
    try {
      for (let attempt = 0; ; attempt++) {
        const res = await doFetch("/api/data/gated/", { credentials: "same-origin", cache: "no-store" });
        if (res.status === 401 && attempt < waits.length) {
          await pause(waits[attempt]);
          continue;
        }
        if (res.status === 401) return setGatedStatus("denied");
        if (!res.ok) return setGatedStatus("error");
        hydrateGated((await res.json()) as GatedPayload);
        return;
      }
    } catch {
      setGatedStatus("error");
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// ---- lookups ------------------------------------------------------------------

export function investorBy(id: string | null | undefined): Investor | undefined {
  return id ? investorById.get(id) : undefined;
}
export function roundsForProject(projectId: string): Round[] {
  return rounds.filter((r) => r.projectId === projectId).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
/** 90-day per-project series (public: the Overview movers sparklines) are loaded lazily so the main bundle stays small. */
let seriesPromise: Promise<import("./types").SeriesFile> | null = null;
export function loadSeries(): Promise<import("./types").SeriesFile> {
  seriesPromise ??= import("@/data/generated/series.json").then((m) => m.default as unknown as import("./types").SeriesFile);
  return seriesPromise;
}
