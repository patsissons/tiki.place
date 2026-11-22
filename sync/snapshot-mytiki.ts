/**
 * Re-read mytiki.life bar pages into data/snapshots/mytiki.json by hand. The weekly sync
 * already reads new and edited bars (see sync/adapters/mytiki.ts); this is for a full
 * refresh: never-read bars first, then edited ones, then rows older than --refresh-days.
 * One page at a time, --interval-s (min 20) plus up to --jitter-s apart. Resumable: the
 * file is saved after every page. Never run from CI. Stops at the first 429/503, bot
 * challenge, or after three failures in a row.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { getRoot, readSources } from "@/lib/data/store";
import { barsToRead, mytikiConfig, readBarPages, readBarSitemap, readSnapshot, writeSnapshot, type MytikiRow } from "./adapters/mytiki";
import { ChallengeDetected, SourceThrottled, createPoliteFetch } from "./core/fetch";

const WEEK_MS = 7 * 86_400_000;

export async function snapshotMytiki(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      limit: { type: "string", default: "150" },
      "refresh-days": { type: "string", default: "120" },
      "interval-s": { type: "string", default: "30" },
      "jitter-s": { type: "string", default: "15" },
    },
  });
  const source = readSources().find((s) => s.id === "mytiki");
  if (!source) throw new Error("data/sources/mytiki.yml not found");
  const config = mytikiConfig(source);
  const intervalMs = Math.max(20, Number(values["interval-s"])) * 1000;
  const jitterMs = Math.max(0, Number(values["jitter-s"])) * 1000;
  const rows = new Map<string, MytikiRow>(readSnapshot(config.snapshot).map((r) => [r.slug, r]));
  const fetch = createPoliteFetch({
    cacheDir: path.join(getRoot(), ".cache", "fetch", source.id),
    userAgent: source.politeness?.userAgent ?? "tiki.place-bot/1.0 (+https://tiki.place/sources)",
    minIntervalMs: intervalMs,
  });
  const stamp = () => new Date().toISOString().slice(11, 19);
  const log = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) };

  let code = 0;
  try {
    const sitemap = await readBarSitemap(fetch, config, WEEK_MS);
    const { missing, edited } = barsToRead(sitemap, rows);
    const maxAgeMs = Number(values["refresh-days"]) * 86_400_000;
    const queued = new Set([...missing, ...edited]);
    const stale = [...sitemap.keys()]
      .filter((s) => !queued.has(s) && Date.now() - Date.parse(rows.get(s)!.fetched_at) > maxAgeMs)
      .sort((a, b) => rows.get(a)!.fetched_at.localeCompare(rows.get(b)!.fetched_at));
    const due = [...missing, ...edited, ...stale].slice(0, Number(values.limit));
    console.log(`${stamp()} ${sitemap.size} bars in the sitemap, ${rows.size} in the snapshot: ${missing.length} new, ${edited.length} edited, ${stale.length} stale; reading ${due.length} now`);
    const { stoppedBy } = await readBarPages(fetch, config, due, {
      intervalMs,
      jitterMs,
      log,
      onRow: (row) => {
        rows.set(row.slug, row);
        writeSnapshot(config.snapshot, rows.values());
      },
    });
    if (stoppedBy) {
      console.error(`${stamp()} ${stoppedBy}. Stopped so we do not stress mytiki.life; resume later.`);
      code = 1;
    }
  } catch (err) {
    if (err instanceof SourceThrottled || err instanceof ChallengeDetected) {
      console.error(`${stamp()} ${err.message}. Stopped so we do not stress mytiki.life; resume later.`);
      code = 1;
    } else throw err;
  }
  console.log(`${stamp()} snapshot holds ${rows.size} row(s): ${config.snapshot} (${fetch.requests} requests this session)`);
  return code;
}
