"use client";

import { AlertTriangle, Clock3, ExternalLink, Globe, MapPinned, RefreshCcw, Share2, Star } from "lucide-react";

import type { TikiBar } from "@/lib/data-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type SelectedBarSheetProps = {
  bar?: TikiBar;
  nearestDistanceKm?: number | null;
  onOpenChange: (open: boolean) => void;
  onReportBad: (bar: TikiBar) => void;
  onRequestRefresh: (bar: TikiBar) => void;
};

export function SelectedBarSheet({
  bar,
  nearestDistanceKm,
  onOpenChange,
  onReportBad,
  onRequestRefresh,
}: SelectedBarSheetProps) {
  function openGoogleMaps() {
    if (!bar) {
      return;
    }

    const placeUrl = `https://google.com/maps/place/?q=place_id:${bar.placeId}`;
    window.open(placeUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyLink() {
    if (!bar || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("bar", bar.placeId);
    await navigator.clipboard.writeText(url.toString());
  }

  return (
    <Sheet open={Boolean(bar)} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        hideOverlay
        className="border-white/55 bg-white/52 pb-8 sm:inset-x-0 sm:bottom-4 sm:top-auto sm:left-1/2 sm:right-auto sm:max-h-[72vh] sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-x-1/2"
      >
        {bar ? (
          <div className="space-y-5">
            <SheetTitle className="sr-only">{bar.name}</SheetTitle>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Selected tiki bar</Badge>
                  <Badge variant="muted">
                    <Star className="mr-1 h-3.5 w-3.5 fill-secondary text-secondary" />
                    {bar.userRatingCount.toLocaleString()} reviews
                  </Badge>
                  {nearestDistanceKm !== undefined && nearestDistanceKm !== null ? (
                    <Badge variant="muted">{nearestDistanceKm.toFixed(1)} km away</Badge>
                  ) : null}
                </div>
                <div>
                  <h2 className="font-display text-3xl leading-tight text-primary">{bar.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {bar.address.locality}, {bar.address.region}, {bar.address.country}
                  </p>
                </div>
              </div>
              <Badge className="text-base">{bar.rating.toFixed(1)}</Badge>
            </div>

            <div className="grid gap-4 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/60 bg-white/38 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    <MapPinned className="h-4 w-4" />
                    Location
                  </div>
                  <p className="mt-3 leading-6">{bar.formattedAddress}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{bar.timeZone}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button className="flex-1 sm:flex-none" onClick={openGoogleMaps}>
                    Open in Google Maps
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  {bar.websiteUrl ? (
                    <Button
                      variant="outline"
                      className="bg-white/65"
                      onClick={() => window.open(bar.websiteUrl, "_blank", "noopener,noreferrer")}
                    >
                      Website
                      <Globe className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button variant="ghost" className="bg-white/45 hover:bg-white/75" onClick={handleCopyLink}>
                    Copy link
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/60 bg-white/38 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  Hours
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {bar.weekdayText.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <Separator className="bg-white/60" />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-white/65" onClick={() => onRequestRefresh(bar)}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="ghost" className="bg-white/45 hover:bg-white/75" onClick={() => onReportBad(bar)}>
                <AlertTriangle className="h-4 w-4" />
                Report
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
