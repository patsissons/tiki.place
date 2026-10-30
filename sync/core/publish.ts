import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicDataDir, readPlaces, serializeJson, writeIfChanged } from "@/lib/data/store";
import { isPublished, type Manifest, type Place } from "@/lib/schema";
import { toPublished } from "@/lib/data/published";

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
