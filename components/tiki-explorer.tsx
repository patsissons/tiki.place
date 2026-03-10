"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Crosshair, Map, Menu, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TikiBar } from "@/lib/data-schema";
import { filterBars, type TikiFilters } from "@/lib/filters";
import { findNearestBar, type Coordinates } from "@/lib/geo";
import { getGlassSurfaceStyle } from "@/lib/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSheet } from "@/components/filter-sheet";
import { SelectedBarSheet } from "@/components/selected-bar-sheet";
import { SubmissionSheet } from "@/components/submission-sheet";
import { TikiMap } from "@/components/tiki-map";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, sheetGlassClassName } from "@/components/ui/sheet";

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

const ACCEPTABLE_LOCATION_ACCURACY_METERS = 100;

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
  const locationWatchIdRef = useRef<number | null>(null);

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
  const glassSurfaceClass = sheetGlassClassName;
  const glassSurfaceStyle = useMemo(() => getGlassSurfaceStyle(mapZoom), [mapZoom]);
  const floatingButtonClass = "text-foreground";

  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
    };
  }, []);

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

  function focusNearestBar(location: Coordinates) {
    const nextNearest = findNearestBar(location, filteredBars);
    if (!nextNearest) {
      setLocationError("No tiki bars match the current filters.");
      return;
    }

    updateSelectedBar(nextNearest.bar.placeId);
    setFocusCoordinates(nextNearest.bar.coordinates);
    setLocationError(null);
  }

  function isStableValidLocation(position: GeolocationPosition) {
    const { latitude, longitude, accuracy } = position.coords;
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      (!Number.isFinite(accuracy) || accuracy <= ACCEPTABLE_LOCATION_ACCURACY_METERS)
    );
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location access.");
      return;
    }

    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isStableValidLocation(position)) {
          setLocationError("Waiting for a more accurate GPS fix.");
          return;
        }

        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(nextLocation);
        focusNearestBar(nextLocation);

        if (locationWatchIdRef.current !== null) {
          navigator.geolocation.clearWatch(locationWatchIdRef.current);
          locationWatchIdRef.current = null;
        }
      },
      () => {
        setLocationError("Location permission was denied. You can still browse the full map.");
        locationWatchIdRef.current = null;
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  }

  function handleNearestBar() {
    if (!userLocation || !nearest) {
      setLocationError("Share your location first to find the nearest tiki bar.");
      return;
    }

    focusNearestBar(userLocation);
  }

  return (
    <main className="relative h-[var(--app-dvh)] overflow-hidden" style={glassSurfaceStyle}>
      <div className="absolute inset-0 bg-tiki-grid opacity-60" />
      <section className="relative h-[var(--app-dvh)] overflow-hidden">
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

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-[calc(0.75rem+var(--safe-top))] md:px-6 md:pt-6">
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
                    triggerClassName={floatingButtonClass}
                    contentClassName={glassSurfaceClass}
                    contentStyle={glassSurfaceStyle}
                  />
                  <Button onClick={() => setSubmissionState({ mode: "new" })}>
                    <Plus className="h-4 w-4" />
                    Submit
                  </Button>
                </div>
              </div>

              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" className={`pointer-events-auto md:hidden ${floatingButtonClass}`}>
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  style={glassSurfaceStyle}
                  className="bg-[rgba(255,255,255,var(--glass-card-bg-opacity,0.78))]"
                >
                  <SheetHeader>
                    <SheetTitle className="sr-only">World Tiki Atlas</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[rgba(255,255,255,var(--glass-border-opacity,0.6))] bg-[rgba(255,255,255,var(--glass-card-bg-opacity,0.55))] p-4">
                      <div className="flex items-center gap-3">
                        <Map className="h-4 w-4 shrink-0 text-primary" />
                        <p className="font-display text-2xl text-primary">World Tiki Atlas</p>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Badge className="w-full justify-center sm:w-auto" variant="muted">
                          {bars.length} tracked
                        </Badge>
                        <Badge className="w-full justify-center sm:w-auto" variant="muted">
                          {filteredBars.length} showing
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <FilterSheet
                        filters={filters}
                        onFiltersChange={setFilters}
                        triggerClassName="justify-start"
                        contentStyle={glassSurfaceStyle}
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
                <Button size="icon" className={floatingButtonClass} onClick={handleUseMyLocation}>
                  <Crosshair className="h-4 w-4" />
                  <span className="sr-only">Use my location</span>
                </Button>
                <Button size="icon" className={floatingButtonClass} onClick={handleNearestBar}>
                  <Compass className="h-4 w-4" />
                  <span className="sr-only">Find nearest tiki bar</span>
                </Button>
              </div>
            </div>
          </div>

          {locationError ? (
            <p className="pointer-events-auto mt-3 inline-flex rounded-full border border-destructive/20 bg-[rgba(255,255,255,var(--glass-card-bg-opacity,0.78))] px-4 py-2 text-sm text-destructive shadow-lg backdrop-blur">
              {locationError}
            </p>
          ) : null}
        </div>
      </section>

      <SelectedBarSheet
        bar={selectedBar}
        nearestDistanceKm={selectedBarDistanceKm}
        contentStyle={glassSurfaceStyle}
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
        contentStyle={glassSurfaceStyle}
        onOpenChange={(open) => {
          if (!open) {
            setSubmissionState(null);
          }
        }}
      />
    </main>
  );
}
