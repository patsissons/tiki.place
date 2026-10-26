import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceGrid } from "@/components/place/place-grid";
import { Button } from "@/components/ui/button";
import { getPublishedPlaces } from "@/lib/data/places";
import { toPublished } from "@/lib/data/published";
import { citySlug, countryName } from "@/lib/utils";

export const dynamicParams = false;

function cityOf(p: ReturnType<typeof getPublishedPlaces>[number]) {
  return citySlug({ locality: p.address.locality, region: p.address.region, country: p.address.country });
}

export function generateStaticParams() {
  return [...new Set(getPublishedPlaces().map(cityOf).filter((s): s is string => Boolean(s)))].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const first = getPublishedPlaces().find((p) => cityOf(p) === slug);
  if (!first) return {};
  const where = [first.address.locality, first.address.region, countryName(first.address.country)].filter(Boolean).join(", ");
  return { title: `Tiki bars in ${where}`, description: `Every verified tiki bar in ${where}, with hours and status.` };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const places = getPublishedPlaces().filter((p) => cityOf(p) === slug);
  if (places.length === 0) notFound();
  const first = places[0]!;
  const lat = places.reduce((s, p) => s + p.location!.lat, 0) / places.length;
  const lng = places.reduce((s, p) => s + p.location!.lng, 0) / places.length;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-fg-muted">
        <Link href="/cities" className="hover:text-fg">Cities</Link> / <Link href={`/countries/${first.address.country!.toLowerCase()}`} className="hover:text-fg">{countryName(first.address.country)}</Link>
      </nav>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
        Tiki bars in {first.address.locality}
        {first.address.region ? <span className="text-fg-muted">, {first.address.region}</span> : null}
      </h1>
      <p className="mt-2 text-fg-muted">{places.length} verified {places.length === 1 ? "place" : "places"}.</p>
      <div className="mt-4">
        <Button asChild>
          <Link href={`/?c=${lat.toFixed(4)},${lng.toFixed(4)},11`}>See on the map</Link>
        </Button>
      </div>
      <div className="mt-8">
        <PlaceGrid places={places.map(toPublished)} />
      </div>
    </main>
  );
}
