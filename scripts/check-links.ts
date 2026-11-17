/**
 * Checks that every timeline event's source link still answers (owner review,
 * 2026-11-09). Warnings only: it never fails the build, since a source site can
 * be down for an hour or refuse automated requests. Runs in prebuild after
 * build-data, which stays network-free. Set SKIP_LINK_CHECK=1 to skip offline.
 *
 *   npx tsx scripts/check-links.ts
 */
import fs from "node:fs";
import path from "node:path";
import type { EcosystemEvent } from "../src/lib/types";
import { UA } from "./fetch/http";
import { OUT } from "./lib/paths";

const TIMEOUT_MS = 5000;
const CONCURRENCY = 6;

/** Statuses that mean the page is gone, as opposed to a site refusing bots (401, 403, 429). */
export function isDead(status: number | null): boolean {
  return status === null || status === 404 || status === 410 || status >= 500;
}

async function probe(url: string): Promise<number | null> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA } });
      // Some hosts reject HEAD; only trust a HEAD answer that is not an error.
      if (method === "HEAD" && res.status >= 400) continue;
      return res.status;
    } catch {
      if (method === "GET") return null;
    }
  }
  return null;
}

async function main() {
  if (process.env.SKIP_LINK_CHECK === "1") return;
  const file = path.join(OUT, "events.json");
  if (!fs.existsSync(file)) return;
  const events = JSON.parse(fs.readFileSync(file, "utf8")) as EcosystemEvent[];
  const urls = Array.from(new Set(events.map((e) => e.sourceUrl).filter((u): u is string => Boolean(u))));
  const results: Array<{ url: string; status: number | null }> = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < urls.length) {
        const url = urls[i++];
        results.push({ url, status: await probe(url) });
      }
    }),
  );
  const dead = results.filter((r) => isDead(r.status));
  const refused = results.filter((r) => r.status !== null && !isDead(r.status) && r.status >= 400);
  console.log(`\n  timeline links: ${urls.length} checked, ${dead.length} dead, ${refused.length} refused automated checks`);
  for (const r of dead) {
    const titles = events.filter((e) => e.sourceUrl === r.url).map((e) => `${e.date} ${e.title}`);
    console.log(`  warning: dead source link (${r.status ?? "no response"}) ${r.url} for ${titles.join("; ")}`);
  }
  for (const r of refused) console.log(`  note: ${r.url} answered ${r.status}, likely a bot block, check it by hand`);
}

main().catch((e) => {
  console.log(`  warning: link check could not run (${(e as Error).message})`);
});
