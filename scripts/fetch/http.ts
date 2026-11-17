/**
 * Polite HTTP client for free APIs: per-host spacing, retry with backoff on
 * 429/5xx (honouring Retry-After), in-run GET cache, descriptive User-Agent.
 * No personal data is ever sent.
 */
export const UA = "base-atlas/1.0 (+https://base.canhav.com)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} ${url}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
}

export interface ClientOpts {
  name: string;
  minIntervalMs: number;
  maxRetries?: number;
  /** Floor for the backoff between retries (rate-limited hosts with minute windows need longer waits). */
  minBackoffMs?: number;
  /**
   * Clients with the same key share one spacing and one pause: the refresh runs sources in parallel, and
   * GeckoTerminal (or the Blockscout key) counts calls per caller, not per source. A 429 on any client
   * holds every client of that key until the backoff has passed.
   */
  rateKey?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => number;
}

export interface ClientStats {
  calls: number;
  retries: number;
  cacheHits: number;
  ms: number;
}

export interface HttpClient {
  getJson<T>(url: string, init?: { headers?: Record<string, string>; noCache?: boolean }): Promise<T>;
  getText(url: string): Promise<string>;
  postJson<T>(url: string, body: unknown, init?: { headers?: Record<string, string> }): Promise<T>;
  stats(): ClientStats;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Limiter {
  chain: Promise<void>;
  lastStart: number;
  pausedUntil: number;
  /** Added to the spacing after each 429 for the rest of the run, so a host that allows less than expected is not hit again. */
  extraMs: number;
}
const sharedLimiters = new Map<string, Limiter>();
function limiterFor(key: string | undefined): Limiter {
  const fresh = (): Limiter => ({ chain: Promise.resolve(), lastStart: Number.NEGATIVE_INFINITY, pausedUntil: 0, extraMs: 0 });
  if (!key) return fresh();
  let l = sharedLimiters.get(key);
  if (!l) sharedLimiters.set(key, (l = fresh()));
  return l;
}
/** Tests only: forget shared limiter state between cases. */
export function resetSharedLimiters(): void {
  sharedLimiters.clear();
}

export function createClient(opts: ClientOpts): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl ?? realSleep;
  const now = opts.nowImpl ?? Date.now;
  const maxRetries = opts.maxRetries ?? 5;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const stats: ClientStats = { calls: 0, retries: 0, cacheHits: 0, ms: 0 };
  const cache = new Map<string, Promise<unknown>>();
  const limiter = limiterFor(opts.rateKey);

  function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = limiter.chain.then(async () => {
      const wait = Math.max(limiter.lastStart + opts.minIntervalMs + limiter.extraMs, limiter.pausedUntil) - now();
      if (wait > 0) await sleep(wait);
      limiter.lastStart = now();
    });
    limiter.chain = run.catch(() => undefined);
    return run.then(fn);
  }

  async function request(url: string, init: RequestInit): Promise<Response> {
    const started = now();
    let attempt = 0;
    for (;;) {
      stats.calls += 1;
      let res: Response | null = null;
      let netErr: unknown = null;
      try {
        res = await fetchImpl(url, {
          ...init,
          headers: { "User-Agent": UA, Accept: "application/json", ...opts.headers, ...(init.headers as Record<string, string>) },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        netErr = e;
      }
      if (res && res.ok) {
        stats.ms += now() - started;
        return res;
      }
      const status = res?.status ?? 0;
      const retryable = netErr !== null || status === 429 || status >= 500;
      if (!retryable || attempt >= maxRetries) {
        stats.ms += now() - started;
        if (res) throw new HttpError(status, url, await res.text().catch(() => ""));
        throw netErr instanceof Error ? netErr : new Error(String(netErr));
      }
      const retryAfter = Number(res?.headers.get("retry-after"));
      const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
      const backoff = Math.max(base, opts.minBackoffMs ?? 0);
      stats.retries += 1;
      attempt += 1;
      const pause = Math.min(backoff, 60_000);
      if (status === 429) {
        limiter.pausedUntil = Math.max(limiter.pausedUntil, now() + pause);
        // Slow down for the rest of the run (1 s per refusal, at most 10 s), only for clients that are spaced at all.
        if (opts.minIntervalMs > 0) limiter.extraMs = Math.min(limiter.extraMs + 1000, 10_000);
      }
      await sleep(pause);
    }
  }

  return {
    getJson<T>(url: string, init?: { headers?: Record<string, string>; noCache?: boolean }): Promise<T> {
      if (!init?.noCache && cache.has(url)) {
        stats.cacheHits += 1;
        return cache.get(url) as Promise<T>;
      }
      const p = schedule(async () => {
        const res = await request(url, { method: "GET", headers: init?.headers });
        return (await res.json()) as T;
      });
      if (!init?.noCache) cache.set(url, p);
      return p;
    },
    getText(url: string): Promise<string> {
      return schedule(async () => {
        const res = await request(url, { method: "GET", headers: { Accept: "*/*" } });
        return res.text();
      });
    },
    postJson<T>(url: string, body: unknown, init?: { headers?: Record<string, string> }): Promise<T> {
      return schedule(async () => {
        const res = await request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...init?.headers },
          body: JSON.stringify(body),
        });
        return (await res.json()) as T;
      });
    },
    stats: () => ({ ...stats }),
  };
}

export interface RpcCall {
  to: string;
  data: string;
}

/** JSON-RPC eth_call batch; tries each RPC URL in order until one answers the whole batch. */
export async function rpcBatch(client: HttpClient, rpcUrls: string[], calls: RpcCall[], chunk = 25): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(calls.length).fill(null);
  for (let start = 0; start < calls.length; start += chunk) {
    const slice = calls.slice(start, start + chunk);
    const body = slice.map((c, i) => ({ jsonrpc: "2.0", id: start + i, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
    let lastErr: unknown = null;
    for (const url of rpcUrls) {
      try {
        const res = await client.postJson<Array<{ id: number; result?: string; error?: unknown }>>(url, body);
        if (!Array.isArray(res)) throw new Error(`RPC ${url}: non-array batch response`);
        for (const r of res) out[r.id] = typeof r.result === "string" ? r.result : null;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
  }
  return out;
}
