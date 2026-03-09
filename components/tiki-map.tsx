"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatBounds } from "mapbox-gl";

import type { TikiBar } from "@/lib/data-schema";
import { env } from "@/lib/env";
import type { Coordinates } from "@/lib/geo";
import { cn } from "@/lib/utils";

import "mapbox-gl/dist/mapbox-gl.css";

type TikiMapProps = {
  bars: TikiBar[];
  selectedBarId?: string;
  userLocation: Coordinates | null;
  focusCoordinates?: Coordinates | null;
  onSelectBar: (bar: TikiBar) => void;
};

type MarkerRecord = {
  marker: mapboxgl.Marker;
};

export function TikiMap({
  bars,
  selectedBarId,
  userLocation,
  focusCoordinates,
  onSelectBar,
}: TikiMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<MarkerRecord[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = env.nextPublicMapboxAccessToken ?? "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: env.nextPublicMapboxStyle,
      center: [0, 20],
      zoom: 1.4,
      projection: "globe",
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("style.load", () => {
      map.setFog({
        color: "rgb(255, 244, 225)",
        "high-color": "rgb(100, 169, 177)",
        "horizon-blend": 0.1,
      });
    });

    mapRef.current = map;

    return () => {
      userMarkerRef.current?.remove();
      markersRef.current.forEach(({ marker }) => {
        marker.remove();
      });
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach(({ marker }) => {
      marker.remove();
    });
    markersRef.current = [];

    const bounds = new LngLatBounds();

    bars.forEach((bar) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = cn(
        "flex h-12 min-w-12 items-center justify-center rounded-full border-2 border-white bg-primary px-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105",
        selectedBarId === bar.placeId && "bg-secondary text-secondary-foreground",
      );
      element.textContent = bar.rating.toFixed(1);
      element.setAttribute("aria-label", `${bar.name} rating ${bar.rating.toFixed(1)}`);
      element.addEventListener("click", () => onSelectBar(bar));

      const marker = new mapboxgl.Marker({ element, anchor: "bottom" })
        .setLngLat([bar.coordinates.lng, bar.coordinates.lat])
        .addTo(map);

      bounds.extend([bar.coordinates.lng, bar.coordinates.lat]);
      markersRef.current.push({ marker });
    });

    if (!focusCoordinates && bars.length > 0) {
      map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 4.5,
        duration: 1200,
      });
    }
  }, [bars, onSelectBar, selectedBarId, focusCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (!userLocation) {
      return;
    }

    const element = document.createElement("div");
    element.className =
      "h-5 w-5 rounded-full border-[3px] border-white bg-secondary shadow-lg shadow-secondary/30";

    userMarkerRef.current = new mapboxgl.Marker({ element })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates) {
      return;
    }

    map.flyTo({
      center: [focusCoordinates.lng, focusCoordinates.lat],
      zoom: 12,
      duration: 1200,
    });
  }, [focusCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!selectedBarId) {
      return;
    }

    const bar = bars.find((entry) => entry.placeId === selectedBarId);
    if (!bar) {
      return;
    }

    map.flyTo({
      center: [bar.coordinates.lng, bar.coordinates.lat],
      zoom: Math.max(map.getZoom(), 7),
      duration: 1200,
    });
  }, [bars, selectedBarId]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {!env.nextPublicMapboxAccessToken ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 px-6 text-center">
          <p className="max-w-md text-lg">
            Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to `.env.local` so the map can render.
          </p>
        </div>
      ) : null}
    </div>
  );
}
