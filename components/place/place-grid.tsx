import Link from "next/link";
import { Star } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import type { PublishedPlace } from "@/lib/schema/published";
import { placeLocation } from "@/lib/utils";

export function PlaceGrid({ places }: { places: PublishedPlace[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {places.map((p) => (
        <li key={p.id}>
          <Link href={`/places/${p.id}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-bg-elevated/60 p-4 transition-colors hover:border-amber/40 hover:bg-bg-elevated">
            <div className="flex items-start justify-between gap-3">
              <span className="font-display text-lg font-semibold leading-tight">{p.name}</span>
              {p.rating !== undefined && (
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-fg-muted">
                  <Star className="size-3 fill-amber text-amber" /> {p.rating.toFixed(1)}
                </span>
              )}
            </div>
            <span className="text-sm text-fg-muted">{placeLocation(p, { countryAsName: true })}</span>
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <StatusChip status={p.status} />
              {p.established && <span className="font-mono text-xs text-fg-muted">est. {p.established}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
