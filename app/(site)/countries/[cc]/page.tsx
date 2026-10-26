import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceGrid } from "@/components/place/place-grid";
import { getPublishedPlaces } from "@/lib/data/places";
import { toPublished } from "@/lib/data/published";
import { countryName } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...new Set(getPublishedPlaces().map((p) => p.address.country).filter((c): c is string => Boolean(c)))].map((cc) => ({ cc: cc.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ cc: string }> }): Promise<Metadata> {
  const name = countryName((await params).cc.toUpperCase());
  return { title: `Tiki bars in ${name}`, description: `Every verified tiki bar in ${name}.` };
}

export default async function CountryPage({ params }: { params: Promise<{ cc: string }> }) {
  const cc = (await params).cc.toUpperCase();
  const places = getPublishedPlaces().filter((p) => p.address.country === cc);
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
