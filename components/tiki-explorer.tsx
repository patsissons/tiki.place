"use client";

import { useMemo, useState } from "react";
import { Compass, Crosshair, MapPinned, Plus, Star } from "lucide-react";

import type { TikiBar } from "@/lib/data-schema";
import { filterBars, type TikiFilters } from "@/lib/filters";
import { findNearestBar, type Coordinates } from "@/lib/geo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterSheet } from "@/components/filter-sheet";
import { SubmissionSheet } from "@/components/submission-sheet";
import { TikiMap } from "@/components/tiki-map";

type SubmissionState =
  | { mode: "new" }
  | { mode: "update"; bar: TikiBar }
  | { mode: "report-bad"; bar: TikiBar }
  | null;

type TikiExplorerProps = {
  bars: TikiBar[];
};

const initialFilters: TikiFilters = {
  search: "",
  minimumRating: 0,
  startLocal: undefined,
  endLocal: undefined,
};

export function TikiExplorer({ bars }: TikiExplorerProps) {
  const [filters, setFilters] = useState<TikiFilters>(initialFilters);
  const [selectedBarId, setSelectedBarId] = useState<string | undefined>(bars[0]?.placeId);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [focusCoordinates, setFocusCoordinates] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>(null);

  const filteredBars = useMemo(() => filterBars(bars, filters), [bars, filters]);
  const selectedBar =
    filteredBars.find((bar) => bar.placeId === selectedBarId) ??
    bars.find((bar) => bar.placeId === selectedBarId) ??
    filteredBars[0];

  const nearest = useMemo(
    () => (userLocation ? findNearestBar(userLocation, filteredBars) : null),
    [filteredBars, userLocation],
  );

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location access.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setFocusCoordinates(nextLocation);
        setLocationError(null);
      },
      () => {
        setLocationError("Location permission was denied. You can still browse the full map.");
      },
      {
        enableHighAccuracy: true,
      },
    );
  }

  function handleNearestBar() {
    if (!nearest) {
      setLocationError("Share your location first to find the nearest tiki bar.");
      return;
    }

    setSelectedBarId(nearest.bar.placeId);
    setFocusCoordinates(nearest.bar.coordinates);
  }

  return (
    <main className="relative min-h-screen overflow-hidden p-0 md:p-5">
      <div className="absolute inset-0 bg-tiki-grid opacity-60" />
      <section className="relative h-screen overflow-hidden md:h-[calc(100vh-2.5rem)] md:rounded-[32px]">
        <TikiMap
          bars={filteredBars}
          selectedBarId={selectedBar?.placeId}
          userLocation={userLocation}
          focusCoordinates={focusCoordinates}
          onSelectBar={(bar) => setSelectedBarId(bar.placeId)}
          onReportBad={(bar) => setSubmissionState({ mode: "report-bad", bar })}
          onRequestRefresh={(bar) => setSubmissionState({ mode: "update", bar })}
        />

        <div className="pointer-events-none absolute inset-0 p-4 md:p-6">
          <div className="pointer-events-auto flex flex-col gap-4">
            <Card className="max-w-2xl animate-fade-in bg-white/72">
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Badge variant="secondary">World Tiki Atlas</Badge>
                    <div>
                      <h1 className="font-display text-4xl leading-none text-primary md:text-6xl">
                        Find the nearest bamboo-lit pour.
                      </h1>
                      <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                        Explore a source-controlled guide to tiki bars around the world. Ratings sit on the pins, hours live
                        in the popup, and the frozen YAML record stays in sync through GitHub issues plus automation.
                      </p>
                    </div>
                  </div>
                  <div className="grid min-w-[180px] gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] bg-primary/8 p-4">
                      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Bars tracked</p>
                      <p className="mt-2 text-3xl font-semibold">{bars.length}</p>
                    </div>
                    <div className="rounded-[22px] bg-secondary/18 p-4">
                      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Showing now</p>
                      <p className="mt-2 text-3xl font-semibold">{filteredBars.length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <FilterSheet filters={filters} onFiltersChange={setFilters} />
                  <Button variant="secondary" onClick={handleUseMyLocation}>
                    <Crosshair className="h-4 w-4" />
                    Use my location
                  </Button>
                  <Button variant="ghost" onClick={handleNearestBar}>
                    <Compass className="h-4 w-4" />
                    Nearest tiki bar
                  </Button>
                  <Button onClick={() => setSubmissionState({ mode: "new" })}>
                    <Plus className="h-4 w-4" />
                    Submit a bar
                  </Button>
                </div>

                {locationError ? <p className="text-sm text-destructive">{locationError}</p> : null}
              </CardContent>
            </Card>

            <Card className="max-w-md bg-white/78">
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Selected spot</p>
                    <h2 className="mt-1 font-display text-2xl">{selectedBar?.name ?? "No tiki bar found"}</h2>
                  </div>
                  {selectedBar ? <Badge>{selectedBar.rating.toFixed(1)}</Badge> : null}
                </div>
                {selectedBar ? (
                  <>
                    <p className="text-sm text-muted-foreground">{selectedBar.formattedAddress}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="muted">
                        <Star className="mr-1 h-3.5 w-3.5" />
                        {selectedBar.userRatingCount.toLocaleString()} reviews
                      </Badge>
                      <Badge variant="muted">
                        <MapPinned className="mr-1 h-3.5 w-3.5" />
                        {selectedBar.timeZone}
                      </Badge>
                    </div>
                    <div className="grid gap-1 text-sm">
                      {selectedBar.weekdayText.slice(0, 3).map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Try easing the filters to bring more bars back onto the map.</p>
                )}
                {nearest ? (
                  <p className="text-sm text-muted-foreground">
                    Nearest from your position: <span className="font-semibold text-foreground">{nearest.bar.name}</span> at{" "}
                    {nearest.distanceKm.toFixed(1)} km.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <SubmissionSheet
        mode={submissionState?.mode ?? null}
        bar={submissionState && "bar" in submissionState ? submissionState.bar : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSubmissionState(null);
          }
        }}
      />
    </main>
  );
}
