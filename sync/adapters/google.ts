/**
 * Google Places API (New): the verifier. Never used for open-ended discovery.
 * Every request is tiered by its field mask and recorded in the budget ledger.
 */
import { z } from "zod";
import { distanceM } from "@/lib/geo";
import { nameSim, normalizeName, tokens } from "@/lib/text";
import type { Observation, Place, StatusHint } from "@/lib/schema";
import { makeObservation, safeUrl } from "./types";

export const FIELD_MASKS = {
  essentials: ["id", "location", "formattedAddress", "addressComponents", "types"],
  pro: ["displayName", "businessStatus", "googleMapsUri", "utcOffsetMinutes"],
  enterprise: ["regularOpeningHours", "websiteUri", "internationalPhoneNumber", "rating", "userRatingCount", "priceLevel"],
} as const;

export type DetailsTier = "pro" | "enterprise";

export function fieldMask(tier: DetailsTier, prefix = ""): string {
  const fields = [...FIELD_MASKS.essentials, ...FIELD_MASKS.pro, ...(tier === "enterprise" ? FIELD_MASKS.enterprise : [])];
  return fields.map((f) => prefix + f).join(",");
}

const GooglePlaceSchema = z.looseObject({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  addressComponents: z
    .array(z.object({ longText: z.string().optional(), shortText: z.string().optional(), types: z.array(z.string()) }))
    .optional(),
  types: z.array(z.string()).optional(),
  businessStatus: z.string().optional(),
  googleMapsUri: z.string().optional(),
  utcOffsetMinutes: z.number().optional(),
  regularOpeningHours: z
    .object({
      periods: z
        .array(
          z.object({
            open: z.object({ day: z.number(), hour: z.number(), minute: z.number() }),
            close: z.object({ day: z.number(), hour: z.number(), minute: z.number() }).optional(),
          }),
        )
        .optional(),
      weekdayDescriptions: z.array(z.string()).optional(),
    })
    .optional(),
  websiteUri: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
});
export type GooglePlace = z.infer<typeof GooglePlaceSchema>;

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GoogleClient {
  details(placeId: string, tier: DetailsTier): Promise<GooglePlace | null>;
  textSearch(query: string, options?: { bias?: { lat: number; lng: number; radiusM: number } }): Promise<GooglePlace[]>;
}

/** Budget accounting happens in the engine, which calls `spend` before every request. */
export function createGoogleClient(options: { apiKey: string; fetchImpl?: typeof fetch }): GoogleClient {
  const { apiKey, fetchImpl = fetch } = options;
  const base = "https://places.googleapis.com/v1";

  return {
    async details(placeId, tier) {
      const res = await fetchImpl(`${base}/places/${encodeURIComponent(placeId)}?languageCode=en`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask(tier) },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new GoogleApiError(res.status, `place details ${placeId}: ${res.status} ${await res.text()}`);
      return GooglePlaceSchema.parse(await res.json());
    },
    async textSearch(query, { bias } = {}) {
      const body: Record<string, unknown> = { textQuery: query, pageSize: 5, languageCode: "en" };
      if (bias) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radiusM } };
      const res = await fetchImpl(`${base}/places:searchText`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask("pro", "places.") },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new GoogleApiError(res.status, `text search "${query}": ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { places?: unknown[] };
      return z.array(GooglePlaceSchema).parse(json.places ?? []);
    },
  };
}

// ---------- mapping ----------

const STATUS: Record<string, StatusHint> = {
  OPERATIONAL: "open",
  CLOSED_TEMPORARILY: "temporarily_closed",
  CLOSED_PERMANENTLY: "closed",
};

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const VENUE_TYPES = new Set(["bar", "night_club", "restaurant", "cafe", "pub", "cocktail_bar", "wine_bar", "lounge", "food", "point_of_interest"]);

export function isVenue(place: GooglePlace): boolean {
  return (place.types ?? []).some((t) => VENUE_TYPES.has(t));
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;

export function googleToObservation(place: GooglePlace, sourceId: string, observedAt: string): Observation {
  const comp = (type: string, short = false) => {
    const c = place.addressComponents?.find((x) => x.types.includes(type));
    return (short ? c?.shortText : c?.longText) || undefined;
  };
  const streetNumber = comp("street_number");
  const route = comp("route");
  const street = [streetNumber, route].filter(Boolean).join(" ") || undefined;
  const locality = comp("locality") ?? comp("postal_town") ?? comp("sublocality_level_1") ?? comp("administrative_area_level_2");
  const country = comp("country", true);
  const hours = place.regularOpeningHours?.periods
    ? {
        periods: place.regularOpeningHours.periods.map((p) => ({
          open: { day: p.open.day, time: hhmm(p.open.hour, p.open.minute) },
          ...(p.close ? { close: { day: p.close.day, time: hhmm(p.close.hour, p.close.minute) } } : {}),
        })),
        weekdayText: place.regularOpeningHours.weekdayDescriptions ?? [],
      }
    : undefined;
  const types = place.types ?? [];
  return makeObservation({
    sourceId,
    sourceRef: place.id,
    url: safeUrl(place.googleMapsUri),
    name: place.displayName?.text ?? place.id,
    address: {
      street,
      locality,
      region: comp("administrative_area_level_1"),
      postalCode: comp("postal_code"),
      country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    },
    formattedAddress: place.formattedAddress,
    coords: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : null,
    coordsPrecision: place.location ? "rooftop" : "none",
    phone: place.internationalPhoneNumber,
    website: safeUrl(place.websiteUri),
    statusHint: place.businessStatus ? (STATUS[place.businessStatus] ?? null) : null,
    categories: types,
    tags: types.some((t) => ["bar", "night_club", "restaurant", "pub", "cocktail_bar", "wine_bar"].includes(t)) ? ["bar-category"] : [],
    externalIds: { google: place.id },
    hours,
    rating: place.rating !== undefined && place.userRatingCount !== undefined ? { value: place.rating, count: place.userRatingCount } : undefined,
    priceLevel: place.priceLevel ? (PRICE[place.priceLevel] ?? place.priceLevel) : undefined,
    utcOffsetMinutes: place.utcOffsetMinutes,
    googleMapsUri: safeUrl(place.googleMapsUri),
    observedAt,
  });
}

// ---------- resolution of a place to a Google candidate ----------

export type CandidatePick =
  | { outcome: "accept"; place: GooglePlace; nameSim: number; distanceM: number | null; weak: boolean }
  | { outcome: "ambiguous"; candidates: { googleId: string; name: string; distanceM: number; nameSim: number }[] }
  | { outcome: "none"; candidates: { googleId: string; name: string; distanceM: number; nameSim: number }[] };

/** Fraction of the candidate's name tokens that appear in the place name (for slug-derived names). */
function containment(candidateName: string, placeName: string): number {
  const c = tokens(normalizeName(candidateName)).filter((t) => t.length > 1);
  const p = new Set(tokens(normalizeName(placeName)));
  if (c.length === 0) return 0;
  return c.filter((t) => p.has(t)).length / c.length;
}

export function pickCandidate(place: Pick<Place, "name" | "aliases" | "location">, results: GooglePlace[]): CandidatePick {
  const names = [place.name, ...place.aliases];
  const scored = results
    .filter((r) => r.location && r.displayName)
    .map((r) => {
      const sim = Math.max(...names.map((n) => nameSim(n, r.displayName!.text)));
      const dist = place.location ? distanceM(place.location, { lat: r.location!.latitude, lng: r.location!.longitude }) : null;
      const contain = Math.max(...names.map((n) => containment(r.displayName!.text, n)));
      let ok = false;
      let weak = false;
      if (dist !== null) {
        const locPrecision = place.location!.precision;
        ok = (sim >= 0.8 && dist <= 150) || (locPrecision === "locality" && sim >= 0.9 && dist <= 1000);
        if (!ok && sim >= 0.9 && dist <= 400) {
          ok = true;
          weak = true;
        }
      } else if (isVenue(r)) {
        if (sim >= 0.8) ok = true;
        else if (contain >= 0.9 && tokens(normalizeName(r.displayName!.text)).length >= 1) {
          ok = true;
          weak = true;
        }
      }
      return { r, sim, dist, ok, weak };
    })
    .sort((a, b) => b.sim - a.sim || (a.dist ?? 0) - (b.dist ?? 0));

  const summary = scored.map((s) => ({ googleId: s.r.id, name: s.r.displayName!.text, distanceM: Math.round(s.dist ?? -1), nameSim: Number(s.sim.toFixed(3)) }));
  const accepted = scored.filter((s) => s.ok);
  if (accepted.length === 0) return { outcome: "none", candidates: summary.slice(0, 5) };
  const [best, second] = accepted;
  if (second && best!.r.id !== second.r.id && second.sim >= best!.sim - 0.05 && !best!.weak === !second.weak) {
    return { outcome: "ambiguous", candidates: summary.slice(0, 5) };
  }
  return { outcome: "accept", place: best!.r, nameSim: best!.sim, distanceM: best!.dist === null ? null : Math.round(best!.dist), weak: best!.weak };
}
