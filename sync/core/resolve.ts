/** Entity resolution: which canonical place does an observation describe? */
import { distanceM, gridKey, neighbourKeys } from "@/lib/geo";
import { nameSim, normalizeName, streetNumber } from "@/lib/text";
import { observationKey, type Decision, type Observation, type Place } from "@/lib/schema";

export type ResolveResult =
  | { kind: "match"; place: Place; via: "source-ref" | "link" | "external-id" | "geo+name" | "locality+name"; score?: number }
  | { kind: "create" };

export class PlaceIndex {
  private bySourceKey = new Map<string, Place>();
  private byExternalId = new Map<string, Place>();
  private grid = new Map<string, Place[]>();
  private byLocality = new Map<string, Place[]>();
  readonly places = new Map<string, Place>();

  constructor(places: Iterable<Place> = []) {
    for (const p of places) this.add(p);
  }

  add(place: Place) {
    this.places.set(place.id, place);
    for (const s of place.sources) this.bySourceKey.set(`${s.sourceId}:${s.sourceRef}`, place);
    for (const [kind, id] of Object.entries(place.externalIds)) this.byExternalId.set(`${kind}:${id}`, place);
    if (place.location) {
      const key = gridKey(place.location);
      const bucket = this.grid.get(key) ?? [];
      if (!bucket.includes(place)) bucket.push(place);
      this.grid.set(key, bucket);
    }
    const loc = localityKey(place.address.locality, place.address.region, place.address.country);
    if (loc) {
      const bucket = this.byLocality.get(loc) ?? [];
      if (!bucket.includes(place)) bucket.push(place);
      this.byLocality.set(loc, bucket);
    }
  }

  /** Re-index after a place changed: drop whatever object currently holds this id, then add the new one. */
  refresh(place: Place) {
    const stale = this.places.get(place.id);
    if (stale) this.remove(stale);
    this.add(place);
  }

  /** Remove by id (merge returns fresh objects, so identity is not a safe key). */
  remove(place: Place) {
    const id = place.id;
    this.places.delete(id);
    for (const [k, v] of this.bySourceKey) if (v.id === id) this.bySourceKey.delete(k);
    for (const [k, v] of this.byExternalId) if (v.id === id) this.byExternalId.delete(k);
    for (const bucket of this.grid.values()) {
      for (let i = bucket.length - 1; i >= 0; i--) if (bucket[i]!.id === id) bucket.splice(i, 1);
    }
    for (const bucket of this.byLocality.values()) {
      for (let i = bucket.length - 1; i >= 0; i--) if (bucket[i]!.id === id) bucket.splice(i, 1);
    }
  }

  bySource(sourceId: string, sourceRef: string) {
    return this.bySourceKey.get(`${sourceId}:${sourceRef}`);
  }
  byExternal(kind: string, id: string) {
    return this.byExternalId.get(`${kind}:${id}`);
  }
  near(coords: { lat: number; lng: number }, radiusM: number): { place: Place; distanceM: number }[] {
    const out: { place: Place; distanceM: number }[] = [];
    const seen = new Set<Place>();
    for (const key of neighbourKeys(coords)) {
      for (const place of this.grid.get(key) ?? []) {
        if (seen.has(place) || !place.location) continue;
        seen.add(place);
        const d = distanceM(coords, place.location);
        if (d <= radiusM) out.push({ place, distanceM: d });
      }
    }
    return out.sort((a, b) => a.distanceM - b.distanceM);
  }
  inLocality(locality?: string, region?: string, country?: string): Place[] {
    const key = localityKey(locality, region, country);
    return key ? (this.byLocality.get(key) ?? []) : [];
  }
}

const US_STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co", connecticut: "ct", delaware: "de",
  "district of columbia": "dc", florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
  kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn",
  mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut",
  vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy",
};
const US_STATE_CODES = new Set(Object.values(US_STATES));

/** Sources write "CA", "California", or a state with no country; all of those are one locality. */
export function localityKey(locality?: string, region?: string, country?: string): string | null {
  if (!locality) return null;
  const r = region ? normalizeName(region) : "";
  const usState = !country || country === "US" ? (US_STATES[r] ?? (US_STATE_CODES.has(r) ? r : undefined)) : undefined;
  return [normalizeName(locality), usState ?? r, usState ? "US" : (country ?? "")].join("|");
}

/** "Strong Water Anaheim" in Anaheim is "Strong Water". */
function withoutLocality(name: string, locality: string): string {
  const n = normalizeName(name);
  const l = normalizeName(locality);
  return n.endsWith(` ${l}`) ? n.slice(0, -l.length - 1) : n;
}

export type DecisionLinks = Map<string, string>; // "sourceId:sourceRef" -> place id

export function buildLinks(decisions: Decision[], redirects: Record<string, string>): DecisionLinks {
  const links: DecisionLinks = new Map();
  for (const d of decisions) if (d.type === "link") links.set(d.key, redirects[d.place] ?? d.place);
  return links;
}

export function bestNameSim(obs: Observation, place: Place): number {
  const mine = [obs.name, ...obs.altNames];
  const theirs = [place.name, ...place.aliases];
  let best = 0;
  for (const a of mine) for (const b of theirs) best = Math.max(best, nameSim(a, b));
  return best;
}

export function bestNameSimPlaces(a: Place, b: Place): number {
  let best = 0;
  for (const x of [a.name, ...a.aliases]) for (const y of [b.name, ...b.aliases]) best = Math.max(best, nameSim(x, y));
  return best;
}

export function resolveObservation(obs: Observation, index: PlaceIndex, links: DecisionLinks): ResolveResult {
  const linked = links.get(observationKey(obs));
  if (linked) {
    const place = index.places.get(linked);
    if (place) return { kind: "match", place, via: "link" };
  }
  const direct = index.bySource(obs.sourceId, obs.sourceRef);
  if (direct) return { kind: "match", place: direct, via: "source-ref" };

  for (const [kind, id] of Object.entries(obs.externalIds)) {
    const hit = index.byExternal(kind, id);
    if (hit) return { kind: "match", place: hit, via: "external-id" };
  }

  if (obs.coords && obs.coordsPrecision !== "none" && obs.coordsPrecision !== "locality") {
    let best: { place: Place; score: number } | null = null;
    for (const { place, distanceM: d } of index.near(obs.coords, 150)) {
      const sim = bestNameSim(obs, place);
      const sameNumber = streetNumber(obs.address.street) !== undefined && streetNumber(obs.address.street) === streetNumber(place.address.street);
      const ok = sim >= 0.85 || (sim >= 0.7 && (d <= 50 || sameNumber));
      if (ok && (!best || sim > best.score)) best = { place, score: sim };
    }
    if (best) return { kind: "match", place: best.place, via: "geo+name", score: best.score };
  }

  if (obs.address.locality) {
    let best: { place: Place; score: number } | null = null;
    for (const place of index.inLocality(obs.address.locality, obs.address.region, obs.address.country)) {
      const locality = obs.address.locality;
      const sim = Math.max(bestNameSim(obs, place), ...[place.name, ...place.aliases].map((n) => nameSim(withoutLocality(obs.name, locality), withoutLocality(n, locality))));
      if (sim >= 0.9 && (!best || sim > best.score)) best = { place, score: sim };
    }
    if (best) return { kind: "match", place: best.place, via: "locality+name", score: best.score };
  }

  return { kind: "create" };
}
