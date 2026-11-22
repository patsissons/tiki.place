/**
 * mytiki.life: a collector community site whose tiki bar section lists ~1,900 bars,
 * past and present, plus motels, apartments and other tiki-themed places.
 *
 * Bar pages carry no coordinates, and there is no feed: one page per bar, kept in a
 * committed snapshot (config.snapshot). The weekly sync reads the sitemap (robots.txt plus
 * five requests), which gives every bar's last-edited date, then reads only bars that are
 * new or edited since we last read them, at most `pagesPerRun`, 30-45 s apart. Bars that
 * leave the sitemap lose their link. A full re-read is `pnpm sync snapshot-mytiki`, by
 * hand. Facts only (name, type, city, phone, website, closed flag); descriptions and photos
 * are never stored. Every derived place links back to its mytiki.life page.
 *
 * Only open bar-like entries vouch for a place (`tiki-directory`); closed rooms and
 * non-bars only add attribution to places that already exist. The site's closed flag
 * is not used as a status hint: collector data is often stale either way.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { countryToIso } from "@/lib/country";
import { getRoot } from "@/lib/data/store";
import type { Address, Observation } from "@/lib/schema";
import { ChallengeDetected, RequestBudgetExhausted, SourceThrottled, type PoliteFetch } from "../core/fetch";
import type { Adapter, AdapterContext, DiscoverResult, Logger } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  base: z.url().default("https://mytiki.life"),
  sitemap: z.url().default("https://mytiki.life/sitemap.xml"),
  snapshot: z.string().default("data/snapshots/mytiki.json"),
  /** Weekly sync: most bar pages to read per run (new bars first, then edited ones). */
  pagesPerRun: z.number().int().min(0).default(10),
  /** Gap between bar pages, plus up to jitterMs more. */
  pageIntervalMs: z.number().int().min(0).default(30_000),
  jitterMs: z.number().int().min(0).default(15_000),
  /** A sitemap listing fewer bars than this means the site changed; refuse it. */
  minBars: z.number().int().min(1).default(500),
});
export type MytikiConfig = z.infer<typeof ConfigSchema>;
export const mytikiConfig = (source: { config: Record<string, unknown> }) => ConfigSchema.parse(source.config);

export const MytikiRowSchema = z.strictObject({
  slug: z.string().min(1),
  id: z.number().int().optional(),
  name: z.string().min(1),
  type: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  closed: z.enum(["no", "yes", "permanently", "temporarily"]).optional(),
  website: z.string().optional(),
  fetched_at: z.iso.datetime(),
});
export type MytikiRow = z.infer<typeof MytikiRowSchema>;

/** Reference sites and socials listed under a bar's links; they are not the bar's own website. */
const NOT_A_WEBSITE =
  /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|youtu|flickr|pinterest|linktr|yelp|tripadvisor|google|goo|wikipedia|wikimedia|archive|tikicentral|critiki|tikiroom|tikirat|tikiwanderlust|tikiatlas|mytiki|blogspot|wordpress|substack|medium|ebay|etsy|amazon|newspapers|imdb|waymarking|cinematreasures|findagrave)\.[a-z.]+$/i;

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Every /tiki-bars/<slug> URL in a sitemap page, with its <lastmod> ("" when absent). */
export function parseBarSitemapEntries(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<loc>\s*https?:\/\/(?:www\.)?mytiki\.life\/tiki-bars\/([a-z0-9-]+)\s*<\/loc>(?:\s*<lastmod>\s*([^<\s]+)\s*<\/lastmod>)?/g)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[2] ?? "");
  }
  return out;
}

export function parseBarSlugs(xml: string): string[] {
  return [...parseBarSitemapEntries(xml).keys()];
}

/** Sitemap index -> the tikiBars section pages. */
export function parseBarSitemaps(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]*section-tikiBars-[^<\s]*)\s*<\/loc>/g)].map((m) => m[1]!);
}

/** Facts from one bar page, or null when the page has no bar on it. */
export function parseBarPage(slug: string, html: string, fetchedAt: string): MytikiRow | null {
  // The bar's title is the h1 tagged with its entry id; other h1s belong to site dialogs.
  const h1 = /<h1[^>]*view-transition-name:\s*title-(\d+)[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const name = h1 ? text(h1[2]!) : "";
  if (!name) return null;
  const id = h1![1];
  const dl = /<h2>\s*Details\s*<\/h2>\s*<dl>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? "";
  const fields = new Map<string, string>();
  for (const m of dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) fields.set(text(m[1]!).toLowerCase(), m[2]!);

  const closedText = fields.has("closed?") ? text(fields.get("closed?")!).toLowerCase() : undefined;
  const closed: MytikiRow["closed"] =
    closedText === undefined ? undefined : closedText.startsWith("no") ? "no" : /perman/.test(closedText) ? "permanently" : /tempor/.test(closedText) ? "temporarily" : "yes";

  const phoneHtml = fields.get("phone");
  const phone = phoneHtml ? (/href="tel:([^"]+)"/.exec(phoneHtml)?.[1]?.trim() ?? text(phoneHtml)) : undefined;

  let website: string | undefined;
  for (const m of (fields.get("links") ?? "").matchAll(/href="([^"]+)"/g)) {
    const url = safeUrl(decode(m[1]!));
    if (!url) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (NOT_A_WEBSITE.test(host)) continue;
    website = url;
    break;
  }

  const row: MytikiRow = {
    slug,
    ...(id ? { id: Number(id) } : {}),
    name,
    ...(fields.has("type") ? { type: text(fields.get("type")!) } : {}),
    ...(phone ? { phone } : {}),
    ...(fields.has("address") ? { address: text(fields.get("address")!) } : {}),
    ...(closed ? { closed } : {}),
    ...(website ? { website } : {}),
    fetched_at: fetchedAt,
  };
  return MytikiRowSchema.parse(row);
}

/** "Austin, Texas, United States" or "123 Main St, Austin, Texas, United States". */
export function parseAddress(value?: string): Address {
  if (!value) return {};
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  const country = countryToIso(parts[parts.length - 1]);
  const rest = country ? parts.slice(0, -1) : parts;
  if (rest.length === 0) return { country };
  if (rest.length === 1) return { locality: rest[0], country };
  const region = rest[rest.length - 1]!;
  let locality = rest[rest.length - 2]!;
  let lead = rest.slice(0, -2);
  // "Washington, D.C., District of Columbia": the city is the part before the abbreviation.
  if (/^d\.?\s?c\.?$/i.test(locality) && lead.length) {
    locality = lead[lead.length - 1]!;
    lead = lead.slice(0, -1);
  }
  // Leading parts are usually a neighbourhood ("Manhattan", "Ville-Marie"); only a part with a house number is a street.
  const street = /[0-9]/.test(lead[0] ?? "") ? lead.join(", ") : undefined;
  return { ...(street ? { street } : {}), locality, region, ...(country ? { country } : {}) };
}

const BAR_LIKE = /\b(bar|lounge|restaurant|pub|tavern|club|nightclub|cocktail|speakeasy)\b/i;
const NOT_BAR = /\b(hotel|motel|apartment|residence|park|museum|shop|store|home|house of worship|attraction|theme|casino resort|ship|cruise)\b/i;

export function vouches(row: MytikiRow): boolean {
  if (row.closed !== "no") return false;
  const type = row.type ?? "";
  return BAR_LIKE.test(type) && !NOT_BAR.test(type);
}

/**
 * mytiki.life titles carry their own disambiguation. "Hula Hut - Austin" in Austin is "Hula Hut",
 * and "Holy Diver Tiki Lounge - at Hi-Tones" is the bar inside a host venue. The full title stays as an
 * alt name, and so does the part before any other " - " ("Chi-Chi - Santa Catalina Island").
 */
export function displayName(name: string, address: Address): { name: string; altNames: string[] } {
  const alts: string[] = [];
  let primary = name;
  const host = /^(.+?)\s+[-–—]{1,2}\s+at\s+\S.*$/i.exec(primary);
  if (host) primary = host[1]!;
  const m = /^(.+?)\s+[-–—]{1,2}\s+(.+)$/.exec(primary);
  if (m) {
    const suffix = m[2]!.toLowerCase();
    const places = [address.locality, address.region].filter(Boolean).map((s) => s!.toLowerCase());
    if (places.some((p) => suffix === p || suffix.startsWith(`${p} `) || suffix.includes(p))) primary = m[1]!;
    else alts.push(m[1]!);
  }
  if (primary !== name) alts.unshift(name);
  return { name: primary, altNames: [...new Set(alts)].filter((a) => a !== primary) };
}

/** slug -> lastmod for every bar in the sitemap (robots.txt aside, one index plus a few section pages). */
export async function readBarSitemap(fetch: PoliteFetch, config: MytikiConfig, cacheTtlMs: number): Promise<Map<string, string>> {
  const index = await fetch(config.sitemap, { cacheTtlMs });
  if (index.status !== 200) throw new Error(`sitemap returned ${index.status}`);
  const bars = new Map<string, string>();
  for (const url of parseBarSitemaps(index.body)) {
    const page = await fetch(url, { cacheTtlMs });
    if (page.status !== 200) throw new Error(`${url} returned ${page.status}`);
    for (const [slug, lastmod] of parseBarSitemapEntries(page.body)) if (!bars.has(slug)) bars.set(slug, lastmod);
  }
  if (bars.size < config.minBars) throw new Error(`sitemap yielded only ${bars.size} bars; has the site changed?`);
  return bars;
}

/** Bars to read: ones we have never read, and ones edited (per the sitemap) since we read them, oldest read first. */
export function barsToRead(sitemap: Map<string, string>, rows: Map<string, MytikiRow>): { missing: string[]; edited: string[] } {
  const missing = [...sitemap.keys()].filter((s) => !rows.has(s)).sort();
  const edited = [...sitemap]
    .filter(([slug, lastmod]) => {
      const row = rows.get(slug);
      const t = Date.parse(lastmod);
      return row !== undefined && Number.isFinite(t) && t > Date.parse(row.fetched_at);
    })
    .map(([slug]) => slug)
    .sort((a, b) => rows.get(a)!.fetched_at.localeCompare(rows.get(b)!.fetched_at));
  return { missing, edited };
}

export type ReadPagesOptions = {
  intervalMs: number;
  jitterMs: number;
  log: Logger;
  onRow: (row: MytikiRow) => void;
  maxConsecutiveFailures?: number;
};

/**
 * Read bar pages one at a time, each started at least intervalMs (plus random jitter) after
 * the last. Stops at the first throttle, bot challenge or exhausted budget, or after three
 * failures in a row, and says why; whatever was read before that is kept.
 */
export async function readBarPages(fetch: PoliteFetch, config: MytikiConfig, slugs: string[], opts: ReadPagesOptions): Promise<{ read: number; stoppedBy?: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const stamp = () => new Date().toISOString().slice(11, 19);
  const maxFailures = opts.maxConsecutiveFailures ?? 3;
  let failures = 0;
  let read = 0;
  let lastStart = 0;
  for (const [i, slug] of slugs.entries()) {
    // The fetcher's interval is only a floor; wait explicitly so the jitter is on top of it.
    if (lastStart) await sleep(Math.max(0, lastStart + opts.intervalMs + Math.floor(Math.random() * opts.jitterMs) - Date.now()));
    lastStart = Date.now();
    const at = `${stamp()} [${i + 1}/${slugs.length}] ${slug}`;
    try {
      const res = await fetch(`${config.base.replace(/\/$/, "")}/tiki-bars/${slug}`);
      if (res.status === 404 || res.status === 410) {
        opts.log.info(`${at}: ${res.status}, skipped`);
        continue;
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const row = parseBarPage(slug, res.body, new Date().toISOString());
      if (!row) throw new Error("no bar on the page");
      opts.onRow(row);
      read++;
      failures = 0;
      opts.log.info(`${at}: ${row.name} | ${row.type ?? "?"} | ${row.address ?? "?"} | closed ${row.closed ?? "?"}`);
    } catch (err) {
      if (err instanceof SourceThrottled || err instanceof ChallengeDetected || err instanceof RequestBudgetExhausted) return { read, stoppedBy: err.message };
      failures++;
      opts.log.warn(`${at}: ${err instanceof Error ? err.message : err}`);
      if (failures >= maxFailures) return { read, stoppedBy: `${failures} failures in a row` };
    }
  }
  return { read };
}

export function writeSnapshot(relPath: string, rows: Iterable<MytikiRow>) {
  const file = path.join(getRoot(), relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sorted = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(file, `[\n${sorted.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`);
}

export function readSnapshot(relPath: string): MytikiRow[] {
  const file = path.join(getRoot(), relPath);
  if (!fs.existsSync(file)) return [];
  return z.array(MytikiRowSchema).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function rowToObservation(sourceId: string, base: string, row: MytikiRow): Observation {
  const address = parseAddress(row.address);
  const { name, altNames } = displayName(row.name, address);
  return makeObservation({
    sourceId,
    sourceRef: row.slug,
    url: `${base.replace(/\/$/, "")}/tiki-bars/${row.slug}`,
    name,
    altNames,
    address,
    coords: null,
    coordsPrecision: "none",
    phone: row.phone,
    website: row.closed === "no" ? row.website : undefined,
    statusHint: null,
    tags: vouches(row) ? ["tiki-directory"] : [],
    observedAt: row.fetched_at,
  });
}

const DAY_MS = 86_400_000;

export const mytikiAdapter: Adapter = {
  id: "mytiki",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = mytikiConfig(ctx.source);
    const rows = new Map(readSnapshot(config.snapshot).map((r) => [r.slug, r]));
    if (rows.size === 0) throw new Error(`snapshot ${config.snapshot} is empty or missing; run pnpm sync snapshot-mytiki`);

    // A sitemap failure (or a challenge) throws, and the engine keeps last run's observations.
    const sitemap = await readBarSitemap(ctx.fetch, config, 3 * DAY_MS);
    const { missing, edited } = barsToRead(sitemap, rows);
    const due = [...missing, ...edited].slice(0, config.pagesPerRun);
    let changed = false;
    if (due.length) {
      ctx.log.info(`mytiki: ${missing.length} new and ${edited.length} edited bar(s); reading ${due.length}`);
      const { stoppedBy } = await readBarPages(ctx.fetch, config, due, {
        intervalMs: config.pageIntervalMs,
        jitterMs: config.jitterMs,
        log: ctx.log,
        onRow: (row) => {
          rows.set(row.slug, row);
          changed = true;
        },
      });
      if (stoppedBy) ctx.log.warn(`mytiki: stopped reading pages (${stoppedBy}); the rest wait for the next run`);
    }
    if (changed && !ctx.dryRun) writeSnapshot(config.snapshot, rows.values());

    // The sitemap is the full listing: bars no longer in it lose their link (their rows stay in the snapshot).
    const listed = [...rows.values()].filter((r) => sitemap.has(r.slug));
    const observations = listed.map((r) => rowToObservation(ctx.source.id, config.base, r));
    return { observations: reconcileObservations(ctx.prior, observations), complete: true };
  },
};
