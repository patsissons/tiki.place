/**
 * The Tiki Atlas (tikiatlas.com): a static atlas of active and vanished tiki bars.
 * Every bar lives in one file, data.js (`window.TIKI_BARS_DATA = [...]`), so a run is
 * a single request. Most entries were imported from the public "All The Tiki Bars"
 * Google My Map and carry a Google place ID, which matches our places for free.
 *
 * Facts only: name, address, coordinates, website, Google ID, opening year. The
 * atlas's summaries, stories, drink lists and images are never stored. Its
 * active/closed flag is not used as a status hint; closed and historic entries only
 * add attribution to places we already have. Every derived place links back to the
 * bar's atlas page.
 */
import { z } from "zod";
import { countryToIso } from "@/lib/country";
import type { Address, Observation } from "@/lib/schema";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  dataUrl: z.url().default("https://tikiatlas.com/data.js"),
  barUrl: z.string().default("https://tikiatlas.com/bar?slug="),
});

/** Only the factual fields we read; everything else in a record is ignored. */
const BarSchema = z.looseObject({
  slug: z.string().min(1),
  name: z.string().min(1),
  status: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  openYear: z.number().int().nullish(),
  address: z.string().nullish(),
  website: z.string().nullish(),
  googlePlaceId: z.string().nullish(),
});
export type AtlasBar = z.infer<typeof BarSchema>;

/** Parse data.js as data: slice out the array literal and JSON.parse it. Never evaluated. */
export function parseAtlasData(js: string): AtlasBar[] {
  const start = js.indexOf("[");
  const end = js.lastIndexOf("]");
  if (!/TIKI_BARS_DATA/.test(js.slice(0, Math.max(0, start))) || start < 0 || end < start) throw new Error("data.js does not hold window.TIKI_BARS_DATA");
  const raw = JSON.parse(js.slice(start, end + 1)) as unknown[];
  const bars: AtlasBar[] = [];
  for (const r of raw) {
    const parsed = BarSchema.safeParse(r);
    if (parsed.success) bars.push(parsed.data);
  }
  return bars;
}

/**
 * Coordinates with five or more decimals came from a map pin. The hand-curated entries are rounded
 * and can be kilometres off (The Mai-Kai's sits 5.5 km from the building), so they only place the town.
 */
function precision(lat: number, lng: number): Observation["coordsPrecision"] {
  const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;
  return Math.min(decimals(lat), decimals(lng)) >= 5 ? "rooftop" : "locality";
}

export function atlasAddress(bar: AtlasBar): Address {
  const country = countryToIso(bar.country);
  const locality = bar.city?.trim() || undefined;
  // Curated US entries leave `state` empty but write "Fort Lauderdale, FL 33308" in the address.
  const region = bar.state?.trim() || (country === "US" ? /,\s*([A-Z]{2})\s+\d{5}\b/.exec(bar.address ?? "")?.[1] : undefined) || undefined;
  // "1386 Yukon Street, Cincinnati, Ohio, 45202, United States": the first part is the street when it isn't the city.
  const first = bar.address?.split(",")[0]?.trim();
  const street = first && first !== locality && /\d|\b(st|street|ave|avenue|rd|road|blvd|hwy|dr|drive|way|lane|ln|calle|rue|via|straße|strasse)\b/i.test(first) ? first : undefined;
  const postalCode = bar.address?.split(",").map((p) => p.trim()).find((p) => /^\d{4,6}(-\d{4})?$/.test(p));
  return { ...(street ? { street } : {}), ...(locality ? { locality } : {}), ...(region ? { region } : {}), ...(postalCode ? { postalCode } : {}), ...(country ? { country } : {}) };
}

export function barToObservation(sourceId: string, barUrl: string, bar: AtlasBar, observedAt: string): Observation {
  const coords = bar.latitude != null && bar.longitude != null ? { lat: bar.latitude, lng: bar.longitude } : null;
  const active = bar.status === "active";
  return makeObservation({
    sourceId,
    sourceRef: bar.slug,
    url: `${barUrl}${encodeURIComponent(bar.slug)}`,
    name: bar.name.trim(),
    address: atlasAddress(bar),
    formattedAddress: bar.address?.trim() || undefined,
    coords,
    coordsPrecision: coords ? precision(coords.lat, coords.lng) : "none",
    website: active ? safeUrl(bar.website) : undefined,
    statusHint: null,
    tags: active ? ["tiki-directory"] : [],
    externalIds: bar.googlePlaceId ? { google: bar.googlePlaceId } : {},
    established: bar.openYear && bar.openYear >= 1800 && bar.openYear <= 2100 ? bar.openYear : undefined,
    observedAt,
  });
}

export const tikiatlasAdapter: Adapter = {
  id: "tikiatlas",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const res = await ctx.fetch(config.dataUrl, { accept: "application/javascript,text/javascript,*/*;q=0.5" });
    if (res.status !== 200) throw new Error(`data.js returned ${res.status}`);
    const bars = parseAtlasData(res.body);
    if (bars.length < 100) throw new Error(`data.js yielded only ${bars.length} bars; has the site changed?`);
    const observedAt = ctx.now.toISOString();
    const observations = bars.map((b) => barToObservation(ctx.source.id, config.barUrl, b, observedAt));
    return { observations: reconcileObservations(ctx.prior, observations), complete: true };
  },
};
