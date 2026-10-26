/**
 * OpenStreetMap via the Overpass API. Finds venues tagged theme=tiki plus bars,
 * pubs, restaurants, cafés and nightclubs whose name contains "tiki". ODbL:
 * attribution is carried on the source definition and rendered on the site.
 */
import { z } from "zod";
import { roundCoord } from "@/lib/geo";
import { looksTiki } from "@/lib/text";
import type { Observation, ObservationTag } from "@/lib/schema";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  endpoints: z.array(z.url()).default(["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]),
  query: z
    .string()
    .default('[out:json][timeout:180];(nwr["theme"="tiki"];nwr["amenity"~"^(bar|pub|restaurant|nightclub|cafe)$"]["name"~"tiki",i];);out center tags;'),
});

const ElementSchema = z.looseObject({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).default({}),
});
const ResponseSchema = z.looseObject({ elements: z.array(ElementSchema) });
export type OverpassElement = z.infer<typeof ElementSchema>;

function statusHint(tags: Record<string, string>): Observation["statusHint"] {
  if (tags["disused:amenity"] || tags["abandoned:amenity"] || tags.disused === "yes") return "closed";
  if (tags.opening_hours === "off" || tags["opening_hours:covid19"] === "off") return "temporarily_closed";
  return null;
}

export function elementToObservation(el: OverpassElement, sourceId: string, observedAt: string): Observation | null {
  const tags = el.tags;
  const name = tags.name ?? tags["name:en"];
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const ref = `${el.type}/${el.id}`;
  const obsTags: ObservationTag[] = [];
  if (tags.theme === "tiki" || tags.bar === "tiki" || tags.cuisine?.split(";").includes("tiki")) obsTags.push("tiki-category");
  if (looksTiki(name)) obsTags.push("tiki-name");
  if (["bar", "pub", "nightclub", "restaurant"].includes(tags.amenity ?? "")) obsTags.push("bar-category");
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || undefined;
  const country = tags["addr:country"]?.toUpperCase();
  const altNames = [tags["alt_name"], tags["official_name"], tags["old_name"]].filter((v): v is string => Boolean(v));
  return makeObservation({
    sourceId,
    sourceRef: ref,
    url: `https://www.openstreetmap.org/${ref}`,
    name,
    altNames,
    address: {
      street,
      locality: tags["addr:city"],
      region: tags["addr:state"] ?? tags["addr:province"],
      postalCode: tags["addr:postcode"],
      country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    },
    coords: lat !== undefined && lon !== undefined ? { lat: roundCoord(lat, 7), lng: roundCoord(lon, 7) } : null,
    coordsPrecision: lat !== undefined && lon !== undefined ? (el.type === "node" ? "rooftop" : "approximate") : "none",
    phone: tags["contact:phone"] ?? tags.phone,
    website: safeUrl(tags["contact:website"] ?? tags.website),
    statusHint: statusHint(tags),
    categories: [tags.amenity, tags.theme && `theme=${tags.theme}`, tags.cuisine && `cuisine=${tags.cuisine}`].filter((v): v is string => Boolean(v)),
    tags: obsTags,
    externalIds: { osm: ref },
    observedAt,
  });
}

export const osmOverpassAdapter: Adapter = {
  id: "osm-overpass",
  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    let lastError: unknown;
    for (const endpoint of config.endpoints) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(config.query)}`;
        const res = await ctx.fetch(url, { accept: "application/json" });
        if (res.status !== 200 || !res.body.trimStart().startsWith("{")) throw new Error(`overpass ${endpoint} returned ${res.status}`);
        const parsed = ResponseSchema.parse(JSON.parse(res.body));
        const observedAt = ctx.now.toISOString();
        const fresh = parsed.elements.map((el) => elementToObservation(el, ctx.source.id, observedAt)).filter((o): o is Observation => o !== null);
        return { observations: reconcileObservations(ctx.prior, fresh), complete: true };
      } catch (err) {
        lastError = err;
        ctx.log.warn(`${ctx.source.id}: ${endpoint} failed (${err instanceof Error ? err.message : String(err)}); trying next mirror`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("all overpass endpoints failed");
  },
};
