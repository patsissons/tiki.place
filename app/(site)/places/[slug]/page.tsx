import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, MapIcon, MapPin, Navigation, Phone, Star } from "lucide-react";
import { HoursTable, OpenNow } from "@/components/place/hours";
import { SourcesFooter } from "@/components/place/sources-footer";
import { StaticMap } from "@/components/place/static-map";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { getPlace, getPublishedPlaces } from "@/lib/data/places";
import { isPublished } from "@/lib/schema";
import { toPublished } from "@/lib/data/published";
import { pageMetadata, placeJsonLd } from "@/lib/seo";
import { citySlug, countryName, googleMapsUrl, placeLocation } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedPlaces().map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place || !isPublished(place)) return {};
  const where = placeLocation({ locality: place.address.locality, region: place.address.region, country: place.address.country }, { countryAsName: true });
  return pageMetadata({
    title: `${place.name} · ${where}`,
    description: `${place.name} is a tiki bar in ${where}. Hours, status, address and sources, verified continuously.`,
    path: `/places/${place.id}`,
  });
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place || !isPublished(place)) notFound();
  const p = toPublished(place);
  const where = placeLocation(p, { countryAsName: true });
  const city = citySlug(p);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd(p)).replace(/</g, "\\u003c") }} />
      <nav className="text-sm text-fg-muted">
        <Link href="/" className="hover:text-fg">Explore</Link>
        {p.country && (
          <>
            {" / "}
            <Link href={`/countries/${p.country.toLowerCase()}`} className="hover:text-fg">{countryName(p.country)}</Link>
          </>
        )}
        {city && (
          <>
            {" / "}
            <Link href={`/cities/${city}`} className="hover:text-fg">{p.locality}</Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={p.status} />
            {p.rating !== undefined && (
              <span className="flex items-center gap-1 font-mono text-xs text-fg-muted">
                <Star className="size-3 fill-amber text-amber" /> {p.rating.toFixed(1)}
                {p.ratingCount ? ` (${p.ratingCount.toLocaleString()})` : ""}
              </span>
            )}
            {p.priceLevel && <span className="font-mono text-xs text-fg-muted">{p.priceLevel}</span>}
          </div>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{p.name}</h1>
          <p className="mt-2 text-fg-muted">
            {where}
            {p.established ? ` · est. ${p.established}` : ""}
          </p>
          <p className="mt-3">
            <OpenNow hours={p.hours} timezone={p.timezone} />
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" asChild>
              <a href={directions} target="_blank" rel="noopener noreferrer"><Navigation /> Directions</a>
            </Button>
            <Button asChild>
              <a href={googleMapsUrl(p)} target="_blank" rel="noopener noreferrer"><MapIcon /> Google Maps</a>
            </Button>
            {p.website && (
              <Button asChild>
                <a href={p.website} target="_blank" rel="noopener noreferrer"><Globe /> Website</a>
              </Button>
            )}
            {p.phone && (
              <Button asChild>
                <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}><Phone /> {p.phone}</a>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href={`/?p=${p.id}&c=${p.lat.toFixed(4)},${p.lng.toFixed(4)},14`}>Open in explorer</Link>
            </Button>
            <ShareButton variant="ghost" path={`/places/${p.id}`} title={p.name} text={where} />
          </div>

          {p.formattedAddress && (
            <p className="mt-8 flex items-start gap-2">
              <MapPin className="mt-1 size-4 shrink-0 text-fg-muted" />
              <span>{p.formattedAddress}</span>
            </p>
          )}

          {p.hours && p.hours.weekdayText.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Hours</h2>
              <div className="mt-3">
                <HoursTable hours={p.hours} timezone={p.timezone} />
              </div>
            </section>
          )}

          {p.aliases.length > 0 && <p className="mt-8 text-sm text-fg-muted">Also listed as {p.aliases.join(", ")}.</p>}

          <SourcesFooter sources={p.sources} lastVerifiedAt={p.lastVerifiedAt} className="mt-10 border-t border-line pt-6" />
          <p className="mt-4 text-sm text-fg-muted">
            Something wrong?{" "}
            <Link href={`/submit?place=${p.id}`} className="text-seaglass hover:underline">Suggest a correction</Link>.
          </p>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-line">
            <StaticMap lat={p.lat} lng={p.lng} />
          </div>
        </aside>
      </div>
    </article>
  );
}
