/**
 * mytiki.life: a collector community site whose tiki bar section lists ~1,900 bars,
 * past and present, plus motels, apartments and other tiki-themed places.
 *
 * Bar pages carry no coordinates. `pnpm sync snapshot-mytiki` reads the sitemap and
 * then one bar page at a time, 20 s or more apart, into a committed snapshot
 * (config.snapshot). This adapter reads only that file, never the network, so the
 * daily sync costs mytiki.life nothing. Facts only (name, type, city, phone, website,
 * closed flag); descriptions and photos are never stored. Every derived place links
 * back to its mytiki.life page.
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
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  base: z.url().default("https://mytiki.life"),
  sitemap: z.url().default("https://mytiki.life/sitemap.xml"),
  snapshot: z.string().default("data/snapshots/mytiki.json"),
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

/** Every /tiki-bars/<slug> URL in a sitemap page. */
export function parseBarSlugs(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*https?:\/\/(?:www\.)?mytiki\.life\/tiki-bars\/([a-z0-9-]+)\s*<\/loc>/g)) out.add(m[1]!);
  return [...out];
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

export const mytikiAdapter: Adapter = {
  id: "mytiki",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = mytikiConfig(ctx.source);
    const rows = readSnapshot(config.snapshot);
    if (rows.length === 0) throw new Error(`snapshot ${config.snapshot} is empty or missing; run pnpm sync snapshot-mytiki`);
    const observations = rows.map((r) => rowToObservation(ctx.source.id, config.base, r));
    // The snapshot fills in over several sessions, so it never claims to be the complete listing.
    return { observations: reconcileObservations(ctx.prior, observations), complete: false };
  },
};
