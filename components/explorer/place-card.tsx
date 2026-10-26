"use client";

import { Star } from "lucide-react";
import { OpenNow } from "@/components/place/hours";
import { StatusChip } from "@/components/ui/status-chip";
import type { PublishedPlace } from "@/lib/schema/published";
import { cn, placeLocation } from "@/lib/utils";

export function PlaceCard({ place, distanceKm, selected, onSelect }: { place: PublishedPlace; distanceKm?: number; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected ? "border-amber/50 bg-amber/8" : "border-transparent hover:border-line hover:bg-fg/4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-display text-[17px] font-semibold leading-tight">{place.name}</span>
        {place.rating !== undefined && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-fg-muted">
            <Star className="size-3 fill-amber text-amber" />
            {place.rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <span>{placeLocation(place, { countryAsName: true })}</span>
        {distanceKm !== undefined && <span className="font-mono">· {distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {place.status !== "open" && <StatusChip status={place.status} />}
        <OpenNow hours={place.hours} timezone={place.timezone} />
      </div>
    </button>
  );
}
