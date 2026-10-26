"use client";

import { ChevronDown, ChevronUp, LocateFixed, Search, X } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClock } from "@/lib/client/use-clock";
import { distanceKm } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { usePlaces, useSearch } from "@/lib/client/use-places";
import type { PublishedPlace } from "@/lib/schema/published";
import { cn } from "@/lib/utils";
import { DetailPanel } from "./detail-panel";
import { PlaceCard } from "./place-card";
import { TikiMap, type Camera } from "./tiki-map";

type FlyTo = { id: string; nonce: number } | { lat: number; lng: number; zoom: number; nonce: number } | null;

function parseCamera(value: string | null): Camera | null {
  if (!value) return null;
  const [lat, lng, zoom] = value.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom) ? { lat: lat!, lng: lng!, zoom: zoom! } : null;
}

export function Explorer({ manifestHash, total }: { manifestHash: string; total: number }) {
  const data = usePlaces(manifestHash);
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [selectedId, setSelectedId] = useQueryState("p", parseAsString);
  const [openOnly, setOpenOnly] = useQueryState("open", parseAsBoolean.withDefault(false));
  const [cameraParam, setCameraParam] = useQueryState("c", parseAsString);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTo>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const clock = useClock();

  const searched = useSearch(data, q);
  const visible = useMemo(() => {
    if (!searched) return [];
    let list = searched;
    if (openOnly) list = list.filter((p) => isOpenNow(p.hours, p.timezone, clock ?? undefined) === true);
    if (userLocation) {
      list = [...list].sort((a, b) => distanceKm(userLocation, a) - distanceKm(userLocation, b));
    } else if (!q.trim()) {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [searched, openOnly, userLocation, q, clock]);

  const allPlaces = data.status === "ready" ? data.places : [];
  const selected = selectedId ? (allPlaces.find((p) => p.id === selectedId) ?? null) : null;

  const select = useCallback(
    (id: string | null) => {
      void setSelectedId(id);
      if (id) {
        setFlyTo({ id, nonce: Date.now() });
        setSheetOpen(true);
      }
    },
    [setSelectedId],
  );

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocating(false);
        setFlyTo({ ...loc, zoom: 11, nonce: Date.now() });
        setSheetOpen(true);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  const onCameraChange = useCallback(
    (c: Camera) => void setCameraParam(`${c.lat.toFixed(4)},${c.lng.toFixed(4)},${c.zoom.toFixed(2)}`, { history: "replace", shallow: true }),
    [setCameraParam],
  );

  const rail = (
    <div className="flex h-full flex-col">
      {selected ? (
        <DetailPanel place={selected} onBack={() => void setSelectedId(null)} />
      ) : (
        <>
          <div className="space-y-2 px-3 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder={`Search ${total.toLocaleString()} tiki places`}
                className="pl-10 pr-9"
                aria-label="Search places"
              />
              {q && (
                <button type="button" onClick={() => void setQ(null)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-muted hover:text-fg" aria-label="Clear search">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={openOnly ? "primary" : "secondary"} onClick={() => void setOpenOnly(openOnly ? null : true)} aria-pressed={openOnly}>
                Open now
              </Button>
              <Button size="sm" variant={userLocation ? "primary" : "secondary"} onClick={locate} disabled={locating}>
                <LocateFixed className={cn(locating && "animate-pulse")} /> {userLocation ? "Nearest first" : "Near me"}
              </Button>
              <span className="ml-auto font-mono text-xs text-fg-muted">
                {data.status === "ready" ? `${visible.length} shown` : data.status === "error" ? "failed to load" : "loading…"}
              </span>
            </div>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto px-2 pb-6 pt-2 [content-visibility:auto]">
            {visible.map((p) => (
              <li key={p.id}>
                <PlaceCard place={p} selected={false} distanceKm={userLocation ? distanceKm(userLocation, p) : undefined} onSelect={() => select(p.id)} />
              </li>
            ))}
            {data.status === "ready" && visible.length === 0 && <li className="px-3 py-8 text-center text-sm text-fg-muted">No places match. Try another name or city.</li>}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg">
      <SiteHeader overlay />
      <div className="absolute inset-0 md:left-[400px]">
        <TikiMap
          places={allPlaces}
          selectedId={selectedId}
          onSelect={select}
          camera={parseCamera(cameraParam)}
          onCameraChange={onCameraChange}
          userLocation={userLocation}
          flyToRequest={flyTo}
        />
      </div>

      {/* Desktop rail */}
      <aside className="absolute inset-y-0 left-0 hidden w-[400px] border-r border-line bg-bg/92 pt-14 backdrop-blur md:block">{rail}</aside>

      {/* Mobile sheet */}
      <section
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-line bg-bg/95 shadow-[0_-10px_40px_-20px_rgba(0,0,0,.8)] backdrop-blur transition-[height] duration-300 md:hidden",
          sheetOpen ? "h-[78dvh]" : "h-[42dvh]",
        )}
        aria-label="Places"
      >
        <button type="button" onClick={() => setSheetOpen((v) => !v)} className="flex h-7 w-full items-center justify-center text-fg-muted" aria-label={sheetOpen ? "Collapse list" : "Expand list"}>
          {sheetOpen ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
        </button>
        <div className="min-h-0 flex-1">{rail}</div>
      </section>
    </main>
  );
}

export type { PublishedPlace };
