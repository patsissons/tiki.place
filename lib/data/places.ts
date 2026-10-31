import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import YAML from "yaml";
import { citySlug } from "../utils";
import { PlaceSchema, SourceSchema, SyncStateSchema, emptySyncState, isPublished, type Place, type Source, type SyncState } from "../schema";

// Statically scoped paths so Next traces exactly these folders into the build.
const PLACES_DIR = path.join(process.cwd(), "data", "places");
const SOURCES_DIR = path.join(process.cwd(), "data", "sources");
const SYNC_STATE = path.join(process.cwd(), "data", "sync-state.json");
const REDIRECTS = path.join(process.cwd(), "data", "redirects.json");

export const getAllPlaces = cache((): Place[] =>
  fs
    .readdirSync(PLACES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => PlaceSchema.parse(JSON.parse(fs.readFileSync(path.join(PLACES_DIR, f), "utf8")))),
);

export const getPublishedPlaces = cache((): Place[] =>
  getAllPlaces()
    .filter(isPublished)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

export const getPlace = cache((id: string): Place | undefined => getAllPlaces().find((p) => p.id === id));

export const getSources = cache((): Source[] =>
  fs
    .readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith(".yml"))
    .sort()
    .map((f) => SourceSchema.parse(YAML.parse(fs.readFileSync(path.join(SOURCES_DIR, f), "utf8")))),
);

export const getSyncState = cache((): SyncState => (fs.existsSync(SYNC_STATE) ? SyncStateSchema.parse(JSON.parse(fs.readFileSync(SYNC_STATE, "utf8"))) : emptySyncState()));

export const getRedirects = cache((): Record<string, string> => (fs.existsSync(REDIRECTS) ? (JSON.parse(fs.readFileSync(REDIRECTS, "utf8")) as Record<string, string>) : {}));

/** City slug for a place, or null when it has no locality/country. Shared by pages and their cards. */
export const cityOf = (p: Place): string | null => citySlug({ locality: p.address.locality, region: p.address.region, country: p.address.country });

export const getCityPlaces = cache((slug: string): Place[] => getPublishedPlaces().filter((p) => cityOf(p) === slug));

export const getCityParams = (): { slug: string }[] => [...new Set(getPublishedPlaces().map(cityOf).filter((s): s is string => Boolean(s)))].map((slug) => ({ slug }));

export const getCountryPlaces = cache((cc: string): Place[] => getPublishedPlaces().filter((p) => p.address.country === cc.toUpperCase()));

export const getCountryParams = (): { cc: string }[] =>
  [...new Set(getPublishedPlaces().map((p) => p.address.country).filter((c): c is string => Boolean(c)))].map((cc) => ({ cc: cc.toLowerCase() }));

export const getSiteStats = cache((): { places: number; countries: number } => {
  const places = getPublishedPlaces();
  return { places: places.length, countries: new Set(places.map((p) => p.address.country).filter(Boolean)).size };
});
