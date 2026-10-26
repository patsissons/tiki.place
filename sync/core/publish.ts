import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicDataDir, readPlaces, serializeJson, writeIfChanged } from "@/lib/data/store";
import { isPublished, type Manifest, type Place, type PublishedPlace } from "@/lib/schema";

export function toPublished(place: Place): PublishedPlace {
  if (!place.location) throw new Error(`cannot publish ${place.id} without a location`);
  return {
    id: place.id,
    name: place.name,
    aliases: place.aliases,
    lat: place.location.lat,
    lng: place.location.lng,
    locality: place.address.locality,
    region: place.address.region,
    country: place.address.country,
    formattedAddress: place.formattedAddress,
    timezone: place.timezone,
    status: place.status.value,
    hours: place.hours,
    website: place.contact.website,
    phone: place.contact.phone,
    googleMapsUri: place.contact.googleMapsUri,
    rating: place.rating?.value,
    ratingCount: place.rating?.count,
    priceLevel: place.priceLevel,
    established: place.established,
    tikiConfidence: place.tikiConfidence,
    verified: Boolean(place.lastVerifiedAt),
    lastVerifiedAt: place.lastVerifiedAt,
    sources: place.sources
      .filter((s) => !s.missingSince)
      .map((s) => ({ id: s.sourceId, url: s.url })),
  };
}

export function buildPublicData(places: Place[]) {
  const published = places
    .filter(isPublished)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(toPublished);
  const placesJson = `${JSON.stringify(published)}\n`;
  const geojson = {
    type: "FeatureCollection",
    features: published.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, status: p.status, locality: p.locality, country: p.country },
    })),
  };
  const countries: Record<string, number> = {};
  for (const p of published) if (p.country) countries[p.country] = (countries[p.country] ?? 0) + 1;
  const manifest: Manifest = {
    version: 1,
    hash: createHash("sha256").update(placesJson).digest("hex").slice(0, 12),
    count: published.length,
    countries: Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b))),
  };
  return {
    "places.json": placesJson,
    "places.geojson": `${JSON.stringify(geojson)}\n`,
    "manifest.json": serializeJson(manifest),
  } as const;
}

export function writePublicData(options: { check?: boolean } = {}) {
  const files = buildPublicData(readPlaces());
  const outDir = options.check ? fs.mkdtempSync(path.join(publicDataDir(), "..", ".data-check-")) : publicDataDir();
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeIfChanged(path.join(outDir, name), content);
  if (options.check) fs.rmSync(outDir, { recursive: true, force: true });
  const manifest = JSON.parse(files["manifest.json"]) as Manifest;
  return { outDir, manifest };
}
