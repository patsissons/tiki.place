"use client";

import { useMemo, useState } from "react";
import { Compass, Crosshair, Map, Menu, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TikiBar } from "@/lib/data-schema";
import { filterBars, type TikiFilters } from "@/lib/filters";
import { findNearestBar, type Coordinates } from "@/lib/geo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSheet } from "@/components/filter-sheet";
import { SelectedBarSheet } from "@/components/selected-bar-sheet";
import { SubmissionSheet } from "@/components/submission-sheet";
import { TikiMap } from "@/components/tiki-map";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TikiFilters>(initialFilters);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [focusCoordinates, setFocusCoordinates] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(1.4);

  const filteredBars = useMemo(() => filterBars(bars, filters), [bars, filters]);
  const permalinkBarId = searchParams.get("bar") ?? undefined;
  const selectedBarId = bars.some((bar) => bar.placeId === permalinkBarId) ? permalinkBarId : undefined;
  const selectedBar = bars.find((bar) => bar.placeId === selectedBarId);

  const nearest = useMemo(
    () => (userLocation ? findNearestBar(userLocation, filteredBars) : null),
    [filteredBars, userLocation],
  );
  const selectedBarDistanceKm =
    userLocation && selectedBar ? findNearestBar(userLocation, [selectedBar])?.distanceKm ?? null : null;
  const glassSurfaceClass =
    mapZoom <= 1.8
      ? "border-white/80 bg-white/78 shadow-2xl shadow-black/25 backdrop-blur-xl"
      : mapZoom <= 4
        ? "border-white/65 bg-white/58 shadow-2xl shadow-primary/15 backdrop-blur-xl"
        : "border-white/55 bg-white/46 shadow-2xl shadow-primary/15 backdrop-blur-lg";
  const floatingButtonClass = `border ${glassSurfaceClass} text-foreground hover:bg-white/82`;

  function updateSelectedBar(barId?: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (barId) {
      nextParams.set("bar", barId);
    } else {
      nextParams.delete("bar");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

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

    updateSelectedBar(nearest.bar.placeId);
    setFocusCoordinates(nearest.bar.coordinates);
  }

  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 bg-tiki-grid opacity-60" />
      <section className="relative h-screen overflow-hidden">
        <TikiMap
          bars={filteredBars}
          selectedBarId={selectedBarId}
          userLocation={userLocation}
          focusCoordinates={focusCoordinates}
          onZoomChange={setMapZoom}
          onSelectBar={(bar) => {
            updateSelectedBar(bar.placeId);
            setFocusCoordinates(bar.coordinates);
          }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-4 md:px-6 md:pt-6">
          <div className="flex items-start justify-start">
            <div className="flex flex-col items-start gap-3">
              <div
                className={`pointer-events-auto hidden w-[min(1120px,calc(100vw-3rem))] items-center gap-4 rounded-full border px-5 py-3 md:flex ${glassSurfaceClass}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Map className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate font-display text-xl leading-none text-primary">World Tiki Atlas</p>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Badge variant="muted">{bars.length} tracked</Badge>
                  <Badge variant="muted">{filteredBars.length} showing</Badge>
                  <FilterSheet
                    filters={filters}
                    onFiltersChange={setFilters}
                    triggerVariant="ghost"
                    triggerClassName={floatingButtonClass}
                    contentClassName={glassSurfaceClass}
                  />
                  <Button className={`border ${glassSurfaceClass}`} onClick={() => setSubmissionState({ mode: "new" })}>
                    <Plus className="h-4 w-4" />
                    Submit
                  </Button>
                </div>
              </div>

              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className={`pointer-events-auto md:hidden ${floatingButtonClass}`}>
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  className={mapZoom <= 1.8 ? "border-white/80 bg-white/88" : "border-white/65 bg-white/82"}
                >
                  <SheetHeader>
                    <SheetTitle>World Tiki Atlas</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-white/60 bg-white/55 p-4">
                      <div className="flex items-center gap-3">
                        <Map className="h-4 w-4 shrink-0 text-primary" />
                        <p className="font-display text-2xl text-primary">World Tiki Atlas</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="muted">{bars.length} tracked</Badge>
                        <Badge variant="muted">{filteredBars.length} showing</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <FilterSheet
                        filters={filters}
                        onFiltersChange={setFilters}
                        triggerVariant="ghost"
                        triggerClassName="justify-start border border-white/60 bg-white/70 hover:bg-white/82"
                      />
                      <Button onClick={() => setSubmissionState({ mode: "new" })}>
                        <Plus className="h-4 w-4" />
                        Submit a bar
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <div className="pointer-events-auto flex flex-col gap-3">
                <Button variant="ghost" size="icon" className={floatingButtonClass} onClick={handleUseMyLocation}>
                  <Crosshair className="h-4 w-4" />
                  <span className="sr-only">Use my location</span>
                </Button>
                <Button variant="ghost" size="icon" className={floatingButtonClass} onClick={handleNearestBar}>
                  <Compass className="h-4 w-4" />
                  <span className="sr-only">Find nearest tiki bar</span>
                </Button>
              </div>
            </div>
          </div>

          {locationError ? (
            <p className="pointer-events-auto mt-3 inline-flex rounded-full border border-destructive/20 bg-white/78 px-4 py-2 text-sm text-destructive shadow-lg backdrop-blur">
              {locationError}
            </p>
          ) : null}
        </div>
      </section>

      <SelectedBarSheet
        bar={selectedBar}
        nearestDistanceKm={selectedBarDistanceKm}
        onOpenChange={(open) => {
          if (!open) {
            updateSelectedBar(undefined);
          }
        }}
        onReportBad={(bar) => setSubmissionState({ mode: "report-bad", bar })}
        onRequestRefresh={(bar) => setSubmissionState({ mode: "update", bar })}
      />

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
