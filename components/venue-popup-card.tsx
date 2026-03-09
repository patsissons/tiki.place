"use client";

import { AlertTriangle, ExternalLink, RefreshCcw, Star } from "lucide-react";

import type { TikiBar } from "@/lib/data-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type VenuePopupCardProps = {
  bar: TikiBar;
  onReportBad: (bar: TikiBar) => void;
  onRequestRefresh: (bar: TikiBar) => void;
};

export function VenuePopupCard({ bar, onReportBad, onRequestRefresh }: VenuePopupCardProps) {
  const placeUrl = `https://google.com/maps/place/?q=place_id:${bar.placeId}`;

  return (
    <div className="w-[320px] rounded-[24px] bg-white p-5 text-sm text-foreground">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xl leading-tight">{bar.name}</p>
          <p className="mt-1 text-muted-foreground">{bar.address.locality}, {bar.address.country}</p>
        </div>
        <Badge>{bar.rating.toFixed(1)}</Badge>
      </div>

      <div className="space-y-2 text-sm">
        <p>{bar.formattedAddress}</p>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Star className="h-4 w-4 fill-secondary text-secondary" />
          <span>{bar.rating.toFixed(1)} rating</span>
          <span>·</span>
          <span>{bar.userRatingCount.toLocaleString()} reviews</span>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Hours</p>
        <ul className="space-y-1 text-sm">
          {bar.weekdayText.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="flex-1" onClick={() => window.open(placeUrl, "_blank", "noopener,noreferrer")}>
          <span className="inline-flex items-center gap-2">
            Open in Google Maps
            <ExternalLink className="h-4 w-4" />
          </span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRequestRefresh(bar)}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onReportBad(bar)}>
          <AlertTriangle className="h-4 w-4" />
          Report
        </Button>
      </div>
    </div>
  );
}
