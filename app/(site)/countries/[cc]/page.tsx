import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceGrid } from "@/components/place/place-grid";
import { getCountryParams, getCountryPlaces } from "@/lib/data/places";
import { toPublished } from "@/lib/data/published";
import { pageMetadata } from "@/lib/seo";
import { countryName } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCountryParams();
}

export async function generateMetadata({ params }: { params: Promise<{ cc: string }> }): Promise<Metadata> {
  const cc = (await params).cc.toUpperCase();
  const places = getCountryPlaces(cc);
  if (places.length === 0) return {};
  const name = countryName(cc) ?? cc;
  return pageMetadata({
    title: `Tiki bars in ${name}`,
    description: `All ${places.length} verified tiki bars in ${name}, with hours and status.`,
    path: `/countries/${cc.toLowerCase()}`,
  });
}

export default async function CountryPage({ params }: { params: Promise<{ cc: string }> }) {
  const cc = (await params).cc.toUpperCase();
  const places = getCountryPlaces(cc);
  if (places.length === 0) notFound();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-fg-muted">
        <Link href="/cities" className="hover:text-fg">Cities</Link>
      </nav>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Tiki bars in {countryName(cc)}</h1>
      <p className="mt-2 text-fg-muted">{places.length} verified places.</p>
      <div className="mt-8">
        <PlaceGrid places={places.map(toPublished)} />
      </div>
    </main>
  );
}
