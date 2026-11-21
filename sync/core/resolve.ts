/** Entity resolution: which canonical place does an observation describe? */
import { distanceM, gridKey, neighbourKeys } from "@/lib/geo";
import { nameSim, normalizeName, streetNumber } from "@/lib/text";
import { observationKey, type Decision, type Observation, type Place } from "@/lib/schema";

export type ResolveResult =
  | { kind: "match"; place: Place; via: "source-ref" | "link" | "external-id" | "phone" | "website" | "geo+name" | "locality+name" | "rejected-guard"; score?: number }
  | { kind: "create" };

/** Digits only, without a leading NANP "1" or international "00"; too-short numbers are ignored. */
export function phoneKey(phone?: string): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 8 ? d : null;
}

/** Hosts many unrelated places share; a match on them means nothing. */
const SHARED_HOSTS =
  /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|linktr|linktree|google|goo|sites\.google|yelp|tripadvisor|opentable|resy|toasttab|square|squareup|order\.online|doordash|ubereats|grubhub|wixsite|business\.site|blogspot|wordpress|weebly|godaddysites|carrd|bento|beacons|taplink|untappd|marriott|hilton|hyatt|ihg|caesars|mgmresorts|disney|disneyworld|disneyland|royalcaribbean|carnival)\.[a-z.]+$/i;

/** "https://www.example.com/menu" -> "example.com"; shared hosts (social, booking, hotel chains) -> null. */
export function hostKey(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || SHARED_HOSTS.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export class PlaceIndex {
  private bySourceKey = new Map<string, Place>();
  private byExternalId = new Map<string, Place>();
  private grid = new Map<string, Place[]>();
  private byLocality = new Map<string, Place[]>();
  private byPhoneKey = new Map<string, Place[]>();
  private byHostKey = new Map<string, Place[]>();
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
    for (const [map, key] of [
      [this.byPhoneKey, phoneKey(place.contact.phone)],
      [this.byHostKey, hostKey(place.contact.website)],
    ] as const) {
      if (!key) continue;
      const bucket = map.get(key) ?? [];
      if (!bucket.includes(place)) bucket.push(place);
      map.set(key, bucket);
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
    for (const map of [this.byLocality, this.byPhoneKey, this.byHostKey]) {
      for (const bucket of map.values()) {
        for (let i = bucket.length - 1; i >= 0; i--) if (bucket[i]!.id === id) bucket.splice(i, 1);
      }
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
  withPhone(phone?: string): Place[] {
    const key = phoneKey(phone);
    return key ? (this.byPhoneKey.get(key) ?? []) : [];
  }
  withHost(website?: string): Place[] {
    const key = hostKey(website);
    return key ? (this.byHostKey.get(key) ?? []) : [];
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

const sameCountry = (a?: string, b?: string) => !a || !b || a === b;

/** Same locality key, or (with coordinates on both) within 2 km. */
function sameTown(obs: Observation, place: Place): boolean {
  const a = localityKey(obs.address.locality, obs.address.region, obs.address.country);
  const b = localityKey(place.address.locality, place.address.region, place.address.country);
  if (a && b && a === b) return true;
  if (obs.coords && place.location) return distanceM(obs.coords, place.location) <= 2000;
  return false;
}

/**
 * Before creating a place, look for a rejected one this observation probably describes, with
 * looser rules than matching. The owner's rejections stand: the observation attaches there
 * (attribution only) instead of starting a fresh candidate.
 */
export function findRejected(obs: Observation, index: PlaceIndex): { place: Place; score: number } | null {
  let best: { place: Place; score: number } | null = null;
  const consider = (place: Place, score: number, min: number) => {
    if (place.review.state !== "rejected" || score < min) return;
    if (!best || score > best.score) best = { place, score };
  };
  if (obs.coords && obs.coordsPrecision !== "none") {
    const near = index.near(obs.coords, 250).map(({ place, distanceM: d }) => ({ place, d, sim: bestNameSim(obs, place) }));
    for (const { place, sim } of near) consider(place, sim, 0.6);
    // A live place at least as close and as alike is the better reading; don't hand the record to a rejection.
    const found = best as { place: Place; score: number } | null;
    if (found) {
      const dRejected = near.find((n) => n.place.id === found.place.id)?.d ?? Infinity;
      if (near.some((n) => n.place.review.state !== "rejected" && n.sim >= found.score && n.d <= dRejected)) best = null;
    }
  }
  const locality = obs.address.locality;
  if (locality) {
    // Without a region on the record, any rejected place in a town of that name (and a compatible country) counts.
    const town = normalizeName(locality);
    const inTown = obs.address.region
      ? index.inLocality(locality, obs.address.region, obs.address.country)
      : [...index.places.values()].filter((p) => p.review.state === "rejected" && p.address.locality && normalizeName(p.address.locality) === town && sameCountry(obs.address.country, p.address.country));
    for (const place of inTown) {
      const sim = Math.max(bestNameSim(obs, place), ...[place.name, ...place.aliases].map((n) => nameSim(withoutLocality(obs.name, locality), withoutLocality(n, locality))));
      consider(place, sim, 0.75);
    }
  }
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

  // Records without a pin (city-only directories) can still be tied to a place by contact details.
  // Records with coordinates go through geo+name instead; contact matches there misfire on resort and group sites.
  const pinned = obs.coords !== null && obs.coordsPrecision !== "none" && obs.coordsPrecision !== "locality";
  if (!pinned) {
    // Same phone number and a plausibly similar name (a hotel switchboard can serve several bars).
    const byPhone = index.withPhone(obs.phone).filter((p) => sameCountry(obs.address.country, p.address.country) && bestNameSim(obs, p) >= 0.5);
    if (byPhone.length === 1) return { kind: "match", place: byPhone[0]!, via: "phone" };

    // Same own website in the same town (chains share a domain across cities).
    const byHost = index.withHost(obs.website).filter((p) => sameTown(obs, p) && bestNameSim(obs, p) >= 0.4);
    if (byHost.length > 0) {
      const best = byHost.map((p) => ({ p, sim: bestNameSim(obs, p) })).sort((a, b) => b.sim - a.sim)[0]!;
      return { kind: "match", place: best.p, via: "website", score: best.sim };
    }
  }

  if (obs.coords && obs.coordsPrecision !== "none" && obs.coordsPrecision !== "locality") {
    let best: { place: Place; score: number } | null = null;
    for (const { place, distanceM: d } of index.near(obs.coords, 150)) {
      const sim = bestNameSim(obs, place);
      const sameNumber = streetNumber(obs.address.street) !== undefined && streetNumber(obs.address.street) === streetNumber(place.address.street);
      // A bare map pin (name + point, no address) on practically the same spot needs less of the name
      // ("Bar Tiki Clearwater Beach" on "Bar Tiki"). Records with an address keep the stricter rule.
      const barePin = !obs.address.street && !obs.address.locality;
      const ok = sim >= 0.85 || (sim >= 0.7 && (d <= 50 || sameNumber)) || (barePin && sim >= 0.6 && d <= 25);
      if (ok && (!best || sim > best.score)) best = { place, score: sim };
    }
    if (best) return { kind: "match", place: best.place, via: "geo+name", score: best.score };
  }

  // A town-level pin (curated atlases, city centroids) is only good to a couple of km; require a strong name match.
  if (obs.coords && obs.coordsPrecision === "locality") {
    let best: { place: Place; score: number } | null = null;
    for (const { place } of index.near(obs.coords, 2000)) {
      const sim = bestNameSim(obs, place);
      if (sim >= 0.85 && (!best || sim > best.score)) best = { place, score: sim };
    }
    if (best) return { kind: "match", place: best.place, via: "geo+name", score: best.score };
  }

  if (obs.address.locality) {
    let best: { place: Place; score: number } | null = null;
    for (const place of index.inLocality(obs.address.locality, obs.address.region, obs.address.country)) {
      const locality = obs.address.locality;
      const sim = Math.max(bestNameSim(obs, place), ...[place.name, ...place.aliases].map((n) => nameSim(withoutLocality(obs.name, locality), withoutLocality(n, locality))));
      // The same street number in the same town makes a looser name enough ("The Mai-Kai" at 3599 vs "Mai-Kai Restaurant and Polynesian Show").
      const sameNumber = streetNumber(obs.address.street) !== undefined && streetNumber(obs.address.street) === streetNumber(place.address.street);
      if (sim >= (sameNumber ? 0.6 : 0.9) && (!best || sim > best.score)) best = { place, score: sim };
    }
    if (best) return { kind: "match", place: best.place, via: "locality+name", score: best.score };
  }

  return { kind: "create" };
}
