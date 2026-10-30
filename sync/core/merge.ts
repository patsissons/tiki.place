/**
 * Merge: a pure function from (existing place, current observations) to a place.
 * Re-running it on the same inputs yields a byte-identical result.
 */
import tzlookup from "@photostructure/tz-lookup";
import { normalizeName } from "@/lib/text";
import type { Observation, Place, Source } from "@/lib/schema";

/** Per-field precedence by source id; sources not listed rank by trust. */
const PRECEDENCE: Record<string, string[]> = {
  name: ["google", "tikirat", "overture", "osm", "tikiwanderlust", "user-submission"],
  location: ["google", "osm", "overture", "tikirat", "user-submission", "tikiwanderlust"],
  address: ["google", "tikirat", "overture", "osm", "user-submission", "tikiwanderlust"],
  formattedAddress: ["google", "tikirat", "overture", "osm"],
  "contact.website": ["google", "tikirat", "overture", "osm", "user-submission"],
  "contact.phone": ["google", "tikirat", "overture", "osm"],
  established: ["tikirat", "overture", "osm", "user-submission"],
};

const PRECISION_RANK = { rooftop: 3, approximate: 2, locality: 1, none: 0 } as const;

export type MergeContext = {
  sources: Map<string, Source>;
  now: Date;
};

function rank(field: string, sourceId: string, sources: Map<string, Source>): number {
  const list = PRECEDENCE[field] ?? [];
  const i = list.indexOf(sourceId);
  if (i >= 0) return i;
  const trust = sources.get(sourceId)?.trust ?? 0;
  return 100 - trust * 10;
}

/** Observations ordered best-first for a field: precedence, then newest. */
function ordered(field: string, observations: Observation[], sources: Map<string, Source>): Observation[] {
  return [...observations].sort((a, b) => {
    const r = rank(field, a.sourceId, sources) - rank(field, b.sourceId, sources);
    return r !== 0 ? r : b.observedAt.localeCompare(a.observedAt);
  });
}

function pick<T>(field: string, observations: Observation[], sources: Map<string, Source>, get: (o: Observation) => T | undefined) {
  for (const o of ordered(field, observations, sources)) {
    const v = get(o);
    if (v !== undefined && v !== null && v !== "") return { value: v as NonNullable<T>, obs: o };
  }
  return null;
}

export function newPlaceSkeleton(id: string, now: Date): Place {
  const at = now.toISOString();
  return {
    id,
    name: id,
    aliases: [],
    location: null,
    address: {},
    externalIds: {},
    status: { value: "unverified", sourceId: "system", at },
    contact: {},
    tikiConfidence: 0,
    review: { state: "needs_review", by: "auto", at },
    provenance: {},
    sources: [],
    firstSeenAt: at,
    lastSyncedAt: at,
  };
}

function stripVolatile(place: Place) {
  const { lastSyncedAt: _l, ...rest } = place;
  return JSON.stringify(rest);
}

export function mergePlace(existing: Place, observations: Observation[], ctx: MergeContext): Place {
  const { sources } = ctx;
  const place: Place = structuredClone(existing);
  const provenance: Place["provenance"] = { ...place.provenance };
  const setProv = (field: string, obs: Observation) => {
    provenance[field] = { sourceId: obs.sourceId, observedAt: obs.observedAt };
  };
  const pinned = (field: string) => provenance[field]?.sourceId === "owner";

  if (observations.length > 0) {
    // name
    if (!pinned("name")) {
      const n = pick("name", observations, sources, (o) => o.name);
      if (n) {
        place.name = n.value;
        setProv("name", n.obs);
      }
    }

    // location: never downgrade precision; prefer precedence among equal-or-better precision
    if (!pinned("location")) {
      const withCoords = observations.filter((o) => o.coords && o.coordsPrecision !== "none");
      const currentRank = place.location ? PRECISION_RANK[place.location.precision] : 0;
      const candidates = withCoords.filter((o) => PRECISION_RANK[o.coordsPrecision as keyof typeof PRECISION_RANK] >= currentRank);
      const best = ordered("location", candidates, sources)[0];
      if (best?.coords) {
        const precision = best.coordsPrecision as Exclude<Observation["coordsPrecision"], "none">;
        const same = place.location && place.location.lat === best.coords.lat && place.location.lng === best.coords.lng && place.location.precision === precision;
        if (!same) {
          place.location = { lat: best.coords.lat, lng: best.coords.lng, precision };
          setProv("location", best);
        } else if (!provenance.location) setProv("location", best);
      }
    }

    // address: best source first, fill gaps from the rest
    if (!pinned("address")) {
      const withAddress = observations.filter((o) => Object.values(o.address).some(Boolean));
      if (withAddress.length > 0) {
        const merged: Place["address"] = {};
        let primary: Observation | null = null;
        for (const o of ordered("address", withAddress, sources)) {
          for (const key of ["street", "locality", "region", "postalCode", "country"] as const) {
            if (merged[key] === undefined && o.address[key]) {
              merged[key] = o.address[key];
              primary ??= o;
            }
          }
        }
        place.address = merged;
        if (primary) setProv("address", primary);
      }
    }
    const fa = pick("formattedAddress", observations, sources, (o) => o.formattedAddress);
    if (fa) {
      place.formattedAddress = fa.value;
      setProv("formattedAddress", fa.obs);
    }

    // contact
    if (!pinned("contact.website")) {
      const w = pick("contact.website", observations, sources, (o) => o.website);
      if (w) {
        place.contact.website = w.value;
        setProv("contact.website", w.obs);
      }
    }
    if (!pinned("contact.phone")) {
      const p = pick("contact.phone", observations, sources, (o) => o.phone);
      if (p) {
        place.contact.phone = p.value;
        setProv("contact.phone", p.obs);
      }
    }
    const g = pick("contact.googleMapsUri", observations, sources, (o) => o.googleMapsUri);
    if (g) {
      place.contact.googleMapsUri = g.value;
      setProv("contact.googleMapsUri", g.obs);
    }

    // rich google fields: latest google observation wins
    const google = observations.filter((o) => o.sourceId === "google").sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    if (google) {
      if (google.hours) {
        place.hours = google.hours;
        setProv("hours", google);
      }
      if (google.rating) {
        place.rating = { ...google.rating, at: google.observedAt };
        setProv("rating", google);
      }
      if (google.priceLevel) {
        place.priceLevel = google.priceLevel;
        setProv("priceLevel", google);
      }
      place.lastVerifiedAt = google.observedAt;
    }

    if (!pinned("established")) {
      const e = pick("established", observations, sources, (o) => o.established);
      if (e) {
        place.established = e.value;
        setProv("established", e.obs);
      }
    }

    // external ids: union; first writer wins on conflict
    for (const o of observations) {
      for (const [kind, id] of Object.entries(o.externalIds)) {
        if (!place.externalIds[kind]) place.externalIds[kind] = id;
      }
    }

    // aliases: every distinct name that is not the canonical one
    const seen = new Set([normalizeName(place.name)]);
    const aliases: string[] = [];
    for (const a of [...place.aliases, ...observations.flatMap((o) => [o.name, ...o.altNames])]) {
      const key = normalizeName(a);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      aliases.push(a);
    }
    place.aliases = aliases.sort((a, b) => a.localeCompare(b));

    // sources[]: first/last seen
    for (const o of observations) {
      const entry = place.sources.find((s) => s.sourceId === o.sourceId && s.sourceRef === o.sourceRef);
      if (entry) {
        if (o.observedAt > entry.lastSeenAt) entry.lastSeenAt = o.observedAt;
        delete entry.missingSince;
        if (o.url) entry.url = o.url;
      } else {
        place.sources.push({ sourceId: o.sourceId, sourceRef: o.sourceRef, url: o.url, firstSeenAt: o.observedAt, lastSeenAt: o.observedAt });
      }
    }
    place.sources.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.sourceRef.localeCompare(b.sourceRef));

    const earliest = observations.map((o) => o.observedAt).sort()[0]!;
    if (earliest < place.firstSeenAt) place.firstSeenAt = earliest;
  }

  // places known only to manually refreshed sources opt out of the daily sync's Google work
  const listedBy = place.sources.filter((s) => s.sourceId !== "google");
  if (listedBy.length > 0 && listedBy.every((s) => sources.get(s.sourceId)?.schedule.discovery === "manual")) place.syncPolicy = "manual";
  else delete place.syncPolicy;

  // timezone from location
  if (place.location && !pinned("timezone")) {
    try {
      const tz = tzlookup(place.location.lat, place.location.lng);
      if (tz !== place.timezone) {
        place.timezone = tz;
        provenance.timezone = { sourceId: "system", observedAt: provenance.location?.observedAt ?? place.lastSyncedAt };
      }
    } catch {
      /* ocean or invalid coords: leave timezone unset */
    }
  }

  place.provenance = Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b)));

  if (stripVolatile(place) !== stripVolatile(existing)) place.lastSyncedAt = ctx.now.toISOString();
  return place;
}

/** The newest observation per source key, which is what merge consumes. */
export function latestPerKey(observations: Observation[]): Observation[] {
  const map = new Map<string, Observation>();
  for (const o of observations) {
    const key = `${o.sourceId}:${o.sourceRef}`;
    const prev = map.get(key);
    if (!prev || o.observedAt > prev.observedAt) map.set(key, o);
  }
  return [...map.values()];
}
