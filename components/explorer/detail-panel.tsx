"use client";

import { ArrowLeft, ExternalLink, Globe, MapPin, Navigation, Phone, Star } from "lucide-react";
import Link from "next/link";
import { HoursTable, OpenNow } from "@/components/place/hours";
import { SourcesFooter } from "@/components/place/sources-footer";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import type { PublishedPlace } from "@/lib/schema/published";
import { placeLocation } from "@/lib/utils";

export function DetailPanel({ place, onBack }: { place: PublishedPlace; onBack: () => void }) {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}${place.googleMapsUri ? "" : ""}`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft /> All places
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={place.status} />
          {place.rating !== undefined && (
            <span className="flex items-center gap-1 font-mono text-xs text-fg-muted">
              <Star className="size-3 fill-amber text-amber" /> {place.rating.toFixed(1)}
              {place.ratingCount ? ` (${place.ratingCount.toLocaleString()})` : ""}
            </span>
          )}
          {place.priceLevel && <span className="font-mono text-xs text-fg-muted">{place.priceLevel}</span>}
        </div>
        <h2 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight">{place.name}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {placeLocation(place, { countryAsName: true })}
          {place.established ? ` · est. ${place.established}` : ""}
        </p>
        <p className="mt-2 text-sm">
          <OpenNow hours={place.hours} timezone={place.timezone} />
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" asChild>
            <a href={directions} target="_blank" rel="noopener noreferrer">
              <Navigation /> Directions
            </a>
          </Button>
          {place.website && (
            <Button size="sm" asChild>
              <a href={place.website} target="_blank" rel="noopener noreferrer">
                <Globe /> Website
              </a>
            </Button>
          )}
          {place.phone && (
            <Button size="sm" asChild>
              <a href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>
                <Phone /> Call
              </a>
            </Button>
          )}
        </div>

        {place.formattedAddress && (
          <p className="mt-5 flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span>{place.formattedAddress}</span>
          </p>
        )}

        {place.hours && place.hours.weekdayText.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Hours</h3>
            <div className="mt-2">
              <HoursTable hours={place.hours} timezone={place.timezone} />
            </div>
          </section>
        )}

        <SourcesFooter sources={place.sources} lastVerifiedAt={place.lastVerifiedAt} className="mt-6" />

        <p className="mt-6 text-sm">
          <Link href={`/places/${place.id}`} className="inline-flex items-center gap-1 text-seaglass hover:underline">
            Permalink <ExternalLink className="size-3.5" />
          </Link>
        </p>
      </div>
    </div>
  );
}
