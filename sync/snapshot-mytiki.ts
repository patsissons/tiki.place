/**
 * Read mytiki.life tiki bar pages into data/snapshots/mytiki.json, slowly: the sitemap
 * for slugs (cached for a week), then one bar page at a time, 20-30 s apart. Run by
 * hand, never from CI. Resumable: rows younger than --refresh-days are kept, and the
 * file is saved after every page. Stops at the first 429/503, bot challenge, or after
 * three failures in a row.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getRoot, readSources } from "@/lib/data/store";
import { mytikiConfig, parseBarPage, parseBarSitemaps, parseBarSlugs, readSnapshot, type MytikiRow } from "./adapters/mytiki";
import { ChallengeDetected, SourceThrottled, createPoliteFetch } from "./core/fetch";

const MAX_CONSECUTIVE_FAILURES = 3;
const WEEK_MS = 7 * 86_400_000;

export async function snapshotMytiki(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      limit: { type: "string", default: "150" },
      "refresh-days": { type: "string", default: "120" },
      "interval-s": { type: "string", default: "20" },
      "jitter-s": { type: "string", default: "10" },
    },
  });
  const source = readSources().find((s) => s.id === "mytiki");
  if (!source) throw new Error("data/sources/mytiki.yml not found");
  const config = mytikiConfig(source);
  const intervalMs = Math.max(20, Number(values["interval-s"])) * 1000;
  const jitterMs = Math.max(0, Number(values["jitter-s"])) * 1000;
  const file = path.join(getRoot(), config.snapshot);
  const rows = new Map<string, MytikiRow>(readSnapshot(config.snapshot).map((r) => [r.slug, r]));
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sorted = [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    fs.writeFileSync(file, `[\n${sorted.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`);
  };

  const fetch = createPoliteFetch({
    cacheDir: path.join(getRoot(), ".cache", "fetch", source.id),
    userAgent: source.politeness?.userAgent ?? "tiki.place-bot/1.0 (+https://tiki.place/sources)",
    minIntervalMs: intervalMs,
  });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const stamp = () => new Date().toISOString().slice(11, 19);

  let code = 0;
  try {
    // ---- slugs from the sitemap (a handful of requests, cached for a week) ----
    const index = await fetch(config.sitemap, { cacheTtlMs: WEEK_MS });
    if (index.status !== 200) throw new Error(`sitemap returned ${index.status}`);
    const slugs = new Set<string>();
    for (const url of parseBarSitemaps(index.body)) {
      const page = await fetch(url, { cacheTtlMs: WEEK_MS });
      if (page.status !== 200) throw new Error(`${url} returned ${page.status}`);
      for (const s of parseBarSlugs(page.body)) slugs.add(s);
    }
    if (slugs.size < 500) throw new Error(`sitemap yielded only ${slugs.size} bars; has the site changed?`);

    const maxAgeMs = Number(values["refresh-days"]) * 86_400_000;
    const fresh = (slug: string) => {
      const at = rows.get(slug)?.fetched_at;
      return at !== undefined && Date.now() - Date.parse(at) <= maxAgeMs;
    };
    const missing = [...slugs].filter((s) => !rows.has(s)).sort();
    const stale = [...slugs].filter((s) => rows.has(s) && !fresh(s)).sort((a, b) => rows.get(a)!.fetched_at.localeCompare(rows.get(b)!.fetched_at));
    const due = [...missing, ...stale].slice(0, Number(values.limit));
    console.log(`${stamp()} ${slugs.size} bars in the sitemap, ${rows.size} in the snapshot, ${missing.length} missing, ${stale.length} stale; reading ${due.length} now`);

    let failures = 0;
    let lastStart = Date.now();
    for (const [i, slug] of due.entries()) {
      // The fetcher enforces the interval as a floor; jitter goes on top of it.
      await sleep(Math.max(0, lastStart + intervalMs + Math.floor(Math.random() * jitterMs) - Date.now()));
      lastStart = Date.now();
      try {
        const res = await fetch(`${config.base.replace(/\/$/, "")}/tiki-bars/${slug}`);
        if (res.status === 404 || res.status === 410) {
          console.log(`${stamp()} [${i + 1}/${due.length}] ${slug}: ${res.status}, skipped`);
          continue;
        }
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const row = parseBarPage(slug, res.body, new Date().toISOString());
        if (!row) throw new Error("no bar on the page");
        rows.set(slug, row);
        save();
        failures = 0;
        console.log(`${stamp()} [${i + 1}/${due.length}] ${slug}: ${row.name} | ${row.type ?? "?"} | ${row.address ?? "?"} | closed ${row.closed ?? "?"}`);
      } catch (err) {
        if (err instanceof SourceThrottled || err instanceof ChallengeDetected) throw err;
        failures++;
        console.warn(`${stamp()} [${i + 1}/${due.length}] ${slug}: ${err instanceof Error ? err.message : err}`);
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`${failures} failures in a row; stopping`);
          code = 1;
          break;
        }
      }
    }
  } catch (err) {
    if (err instanceof SourceThrottled || err instanceof ChallengeDetected) {
      console.error(`${stamp()} ${err.message}. Stopped so we do not stress mytiki.life; resume later.`);
      code = 1;
    } else throw err;
  } finally {
    save();
  }
  console.log(`${stamp()} snapshot holds ${rows.size} row(s): ${config.snapshot} (${fetch.requests} requests this session)`);
  return code;
}
