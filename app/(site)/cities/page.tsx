import Link from "next/link";
import { getPublishedPlaces } from "@/lib/data/places";
import { pageMetadata } from "@/lib/seo";
import { citySlug, countryName } from "@/lib/utils";

export const metadata = pageMetadata({ title: "Cities", description: "Every city with a verified tiki bar, grouped by country.", path: "/cities" });

export default function CitiesPage() {
  const groups = new Map<string, { slug: string; locality: string; region?: string; country: string; count: number }>();
  for (const p of getPublishedPlaces()) {
    const slug = citySlug({ locality: p.address.locality, region: p.address.region, country: p.address.country });
    if (!slug) continue;
    const g = groups.get(slug) ?? { slug, locality: p.address.locality!, region: p.address.region, country: p.address.country!, count: 0 };
    g.count++;
    groups.set(slug, g);
  }
  const byCountry = new Map<string, typeof groups extends Map<string, infer V> ? V[] : never>();
  for (const g of groups.values()) byCountry.set(g.country, [...(byCountry.get(g.country) ?? []), g]);
  const countries = [...byCountry.entries()].sort(([a], [b]) => (countryName(a) ?? a).localeCompare(countryName(b) ?? b));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Cities</h1>
      <p className="mt-2 text-fg-muted">{groups.size} cities with at least one verified tiki place.</p>
      <div className="mt-8 columns-1 gap-8 sm:columns-2 lg:columns-3">
        {countries.map(([cc, cities]) => (
          <section key={cc} className="mb-8 break-inside-avoid">
            <h2 className="font-display text-xl font-semibold">
              <Link href={`/countries/${cc.toLowerCase()}`} className="hover:text-amber">{countryName(cc)}</Link>
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {cities
                .sort((a, b) => b.count - a.count || a.locality.localeCompare(b.locality))
                .map((c) => (
                  <li key={c.slug} className="flex justify-between gap-3">
                    <Link href={`/cities/${c.slug}`} className="hover:text-amber">
                      {c.locality}
                      {c.region ? <span className="text-fg-muted">, {c.region}</span> : null}
                    </Link>
                    <span className="font-mono text-xs text-fg-muted">{c.count}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
