import type { MetadataRoute } from "next";
import { getPublishedPlaces } from "@/lib/data/places";
import { citySlug } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tiki.place";
  const places = getPublishedPlaces();
  const cities = new Set(places.map((p) => citySlug({ locality: p.address.locality, region: p.address.region, country: p.address.country })).filter(Boolean));
  const countries = new Set(places.map((p) => p.address.country).filter(Boolean));
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/cities`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/sources`, changeFrequency: "daily", priority: 0.4 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...places.map((p) => ({ url: `${base}/places/${p.id}`, lastModified: p.lastSyncedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...[...cities].map((c) => ({ url: `${base}/cities/${c}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...[...countries].map((c) => ({ url: `${base}/countries/${c!.toLowerCase()}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
