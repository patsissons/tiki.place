/**
 * Tiki Rat (tikirat.com): a curated directory of tiki bars run by a friend of the
 * project. The daily sync reads only the sitemap: one request per run gives every
 * bar slug, and each slug becomes a directory observation.
 *
 * Bar pages are client-rendered. With the owner's permission, `pnpm sync
 * snapshot-tikirat` slowly renders them into a committed snapshot (config.snapshot)
 * that hydrates address, coordinates, phone, website and "last verified" without any
 * network. An export or feed (config.feedUrl) would hydrate the same fields. Editorial
 * text is never stored; every derived place links back to its tikirat page.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getRoot } from "@/lib/data/store";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";
import type { Observation } from "@/lib/schema";

const ConfigSchema = z.object({
  sitemap: z.url().default("https://tikirat.com/sitemap.xml"),
  pathPrefix: z.string().default("/bars/"),
  feedUrl: z.url().optional(),
  /** Repo-relative path of a committed snapshot written by `pnpm sync snapshot-tikirat`. */
  snapshot: z.string().optional(),
});

export function parseSitemap(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) urls.push(m[1]!);
  return urls;
}

/** "the-luau-san-diego" -> "The Luau San Diego"; "trader-sam-s" -> "Trader Sam's". */
export function nameFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w === "s" && out.length > 0) {
      out[out.length - 1] += "'s";
      continue;
    }
    if (w === "and") {
      out.push("&");
      continue;
    }
    if (/^\d+$/.test(w)) {
      out.push(w);
      continue;
    }
    out.push(w.charAt(0).toUpperCase() + w.slice(1));
  }
  return out.join(" ");
}

/** Shape of an export tikirat could hand us. Everything optional so a partial feed still helps. */
const FeedRowSchema = z.looseObject({
  slug: z.string().min(1),
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  formatted_address: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  established: z.coerce.number().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  last_verified: z.string().optional(),
  fetched_at: z.string().optional(),
});
export type FeedRow = z.infer<typeof FeedRowSchema>;

const COUNTRY_NAMES: Record<string, string> = {
  "united states": "US",
  usa: "US",
  us: "US",
  canada: "CA",
  "united kingdom": "GB",
  uk: "GB",
  australia: "AU",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  japan: "JP",
  mexico: "MX",
  "new zealand": "NZ",
  sweden: "SE",
  denmark: "DK",
  norway: "NO",
  finland: "FI",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  portugal: "PT",
  ireland: "IE",
  brazil: "BR",
  argentina: "AR",
  singapore: "SG",
  "hong kong": "HK",
  "sri lanka": "LK",
  thailand: "TH",
};

export function countryCode(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_NAMES[v.toLowerCase()];
}

function statusHint(value?: string): Observation["statusHint"] {
  const v = value?.toLowerCase() ?? "";
  if (!v) return null;
  if (/temporar/.test(v)) return "temporarily_closed";
  if (/coming|soon|opening/.test(v)) return "coming_soon";
  if (/closed|defunct|historic/.test(v)) return "closed";
  if (/open/.test(v)) return "open";
  return null;
}

const BarLdSchema = z.looseObject({
  name: z.string().min(1),
  url: z.string().optional(),
  telephone: z.string().optional(),
  address: z.looseObject({
    streetAddress: z.string().optional(),
    addressLocality: z.string().optional(),
    addressRegion: z.string().optional(),
    addressCountry: z.string().optional(),
  }),
  geo: z.looseObject({ latitude: z.number(), longitude: z.number() }).optional(),
});

const present = (v?: string) => (v && !/^[—–-]*$/.test(v.trim()) ? v.trim() : undefined);

/** "4401 Piedmont Ave, Oakland CA 94611, USA" with city "Oakland" -> "4401 Piedmont Ave". */
function streetFrom(full: string, city?: string): string | undefined {
  const parts = full.split(",").map((p) => p.trim());
  const cityAt = city ? parts.findIndex((p) => p.toLowerCase().startsWith(city.toLowerCase())) : -1;
  const street = (cityAt > 0 ? parts.slice(0, cityAt) : parts.slice(0, 1)).join(", ");
  return street && street.toLowerCase() !== city?.toLowerCase() ? street : undefined;
}

/**
 * Facts from a rendered bar page: its JSON-LD plus the labelled lines in the page text.
 * Picks named fields only; the description and story are never read into the row.
 */
export function parseBarPage(slug: string, page: { text: string; ldJson: string[] }, fetchedAt: string): FeedRow | null {
  let ld: z.infer<typeof BarLdSchema> | undefined;
  for (const raw of page.ldJson) {
    try {
      const parsed = BarLdSchema.safeParse(JSON.parse(raw));
      if (parsed.success) ld = parsed.data;
    } catch {
      /* some other ld+json block */
    }
  }
  if (!ld) return null;
  const lines = page.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const after = (label: string) => {
    const i = lines.indexOf(label);
    return i >= 0 ? lines[i + 1] : undefined;
  };
  const header = lines.slice(lines.indexOf("ALL BARS") + 1, lines.indexOf("ALL BARS") + 3);
  const full = present(ld.address.streetAddress);
  const city = present(ld.address.addressLocality);
  const website = safeUrl(present(ld.url));
  const established = /(\d{4})/.exec(after("ESTABLISHED") ?? "")?.[1];
  const verified = after("LAST VERIFIED");
  const postal = full && /\b(\d{5}(?:-\d{4})?|[A-Z]\d[A-Z] ?\d[A-Z]\d)\b/.exec(full)?.[1];
  return {
    slug,
    name: ld.name,
    address: full ? streetFrom(full, city) : undefined,
    formatted_address: full,
    city,
    region: present(ld.address.addressRegion),
    country: present(ld.address.addressCountry),
    postal_code: postal || undefined,
    lat: ld.geo?.latitude,
    lng: ld.geo?.longitude,
    phone: present(ld.telephone),
    website: website && new URL(website).hostname.includes(".") ? website : undefined,
    established: established ? Number(established) : undefined,
    status: header.find((l) => /open|closed|soon|temporar|defunct|historic/i.test(l)),
    kind: header.find((l) => /^tiki( adjacent)?$/i.test(l))?.toLowerCase().replace(/\s+/g, "-"),
    last_verified: verified && /^\d{4}-\d{2}-\d{2}/.test(verified) ? verified.slice(0, 10) : undefined,
    fetched_at: fetchedAt,
  };
}

export const tikiratAdapter: Adapter = {
  id: "tikirat",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const res = await ctx.fetch(config.sitemap, { accept: "application/xml,text/xml" });
    if (res.status !== 200) throw new Error(`sitemap returned ${res.status}`);
    const base = new URL(config.sitemap).origin;
    const slugs = parseSitemap(res.body)
      .filter((u) => u.startsWith(base + config.pathPrefix))
      .map((u) => decodeURIComponent(u.slice((base + config.pathPrefix).length).replace(/\/$/, "")))
      .filter((s) => s.length > 0 && !s.includes("/"));
    if (slugs.length < 50) ctx.log.warn(`tikirat sitemap yielded only ${slugs.length} bar slugs; parser may be stale`);

    const prior = new Map(ctx.prior.map((o) => [o.sourceRef, o]));
    const observedAt = ctx.now.toISOString();
    const fresh = slugs.map((slug) => {
      const before = prior.get(slug);
      // Keep richer prior data (from a feed) when this run only saw the sitemap.
      if (before && before.coords) return before;
      return makeObservation({
        sourceId: ctx.source.id,
        sourceRef: slug,
        url: `${base}${config.pathPrefix}${slug}`,
        name: nameFromSlug(slug),
        coords: null,
        coordsPrecision: "none",
        statusHint: null,
        tags: ["tiki-directory"],
        externalIds: { tikirat: slug },
        observedAt,
      });
    });
    let observations = reconcileObservations(ctx.prior, fresh);

    const pageBase = base + config.pathPrefix;
    if (config.snapshot) observations = hydrate(ctx, readSnapshot(ctx, config.snapshot), observations, pageBase);
    if (config.feedUrl) observations = await hydrateFromFeed(ctx, config.feedUrl, observations, pageBase);
    return { observations, complete: true };
  },
};

async function hydrateFromFeed(ctx: AdapterContext, feedUrl: string, observations: Observation[], pageBase: string) {
  const res = await ctx.fetch(feedUrl, { accept: "application/json" });
  if (res.status !== 200) {
    ctx.log.warn(`tikirat feed returned ${res.status}; using sitemap only`);
    return observations;
  }
  const rows = z.array(FeedRowSchema).safeParse(JSON.parse(res.body));
  if (!rows.success) {
    ctx.log.warn("tikirat feed did not match the expected shape; using sitemap only");
    return observations;
  }
  return hydrate(ctx, rows.data, observations, pageBase);
}

function readSnapshot(ctx: AdapterContext, relPath: string): FeedRow[] {
  const file = path.join(getRoot(), relPath);
  if (!fs.existsSync(file)) {
    ctx.log.warn(`tikirat snapshot ${relPath} not found; using sitemap only`);
    return [];
  }
  return z.array(FeedRowSchema).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

function hydrate(ctx: AdapterContext, rows: FeedRow[], observations: Observation[], pageBase: string) {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const hydrated = observations.map((o) => {
    const row = bySlug.get(o.sourceRef);
    if (!row) return o;
    const lat = row.lat ?? row.latitude;
    const lng = row.lng ?? row.longitude;
    const coords = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    return makeObservation({
      sourceId: o.sourceId,
      sourceRef: o.sourceRef,
      url: `${pageBase}${o.sourceRef}`,
      name: row.name ?? o.name,
      formattedAddress: row.formatted_address || undefined,
      address: {
        street: row.address || undefined,
        locality: row.city || undefined,
        region: row.region || row.state || undefined,
        postalCode: row.postal_code || undefined,
        country: countryCode(row.country),
      },
      coords,
      coordsPrecision: coords ? "rooftop" : "none",
      phone: row.phone || undefined,
      website: safeUrl(row.website),
      statusHint: statusHint(row.status),
      categories: row.kind ? [row.kind] : [],
      tags: ["tiki-directory"],
      externalIds: { tikirat: o.sourceRef },
      established: row.established && row.established > 1800 ? row.established : undefined,
      sourceVerifiedAt: row.last_verified && /^\d{4}-\d{2}-\d{2}/.test(row.last_verified) ? row.last_verified.slice(0, 10) : undefined,
      observedAt: row.fetched_at ?? ctx.now.toISOString(),
    });
  });
  return reconcileObservations(ctx.prior, hydrated);
}
