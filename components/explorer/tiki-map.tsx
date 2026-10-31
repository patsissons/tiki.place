"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import type { FogSpecification, GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import type { MapMouseEvent, MapRef } from "react-map-gl/mapbox";
import { Layer, Map, Marker, Source } from "react-map-gl/mapbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_COLOR } from "@/lib/client/status";
import { distanceKm } from "@/lib/geo";
import type { PublishedPlace } from "@/lib/schema/published";
import { SpaceBackdrop } from "./space-backdrop";

export type Camera = { lat: number; lng: number; zoom: number };

type Props = {
  places: PublishedPlace[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera: Camera | null;
  onCameraChange: (c: Camera) => void;
  /** Reports the ids of the places visible in the map frame whenever the frame changes. */
  onFrameChange: (ids: Set<string>) => void;
  userLocation: { lat: number; lng: number } | null;
  /** Extra bottom padding (px) so fitted bounds clear the mobile sheet. */
  bottomPadding?: number;
  flyToRequest: { id: string; nonce: number } | { lat: number; lng: number; zoom: number; nonce: number } | null;
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const DARK = "mapbox://styles/mapbox/dark-v11";
const LIGHT = "mapbox://styles/mapbox/light-v11";

/**
 * The styles paint space black (dark) or white (light). A fully transparent,
 * black space colour lets the sky canvas behind the map show through; the
 * atmosphere shader premultiplies against it, so the RGB must stay black and
 * the halo is tuned through `color` and `high-color` only.
 */
const FOG_DARK: FogSpecification = {
  range: [-1, 10],
  color: "rgba(15, 42, 46, 0.55)",
  "high-color": "rgba(95, 194, 180, 0.22)",
  "space-color": "rgba(0, 0, 0, 0)",
  "horizon-blend": 0.06,
  "star-intensity": 0,
};
const FOG_LIGHT: FogSpecification = {
  range: [-1, 10],
  color: "rgba(246, 239, 224, 0.32)",
  "high-color": "rgba(255, 250, 240, 0.14)",
  "space-color": "rgba(0, 0, 0, 0)",
  "horizon-blend": 0.05,
  "star-intensity": 0,
};
/** Start the sky even if the map never reports `load` (offline, blocked tiles). */
const SKY_FALLBACK_MS = 2500;

function useColorScheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setDark(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return dark;
}

function placesInFrame(map: MapRef, places: PublishedPlace[], bottomPadding: number) {
  const { clientWidth: width, clientHeight } = map.getContainer();
  const height = clientHeight - bottomPadding;
  const centerLng = map.getCenter().lng;
  const ids = new Set<string>();
  for (const p of places) {
    // Zoomed out, the world repeats: test the copy nearest the centre.
    const lng = p.lng + 360 * Math.round((centerLng - p.lng) / 360);
    const { x, y } = map.project([lng, p.lat]);
    if (x < 0 || x > width || y < 0 || y > height) continue;
    // On the globe, far-side places project inside the disc but unproject to the near side.
    if (distanceKm(map.unproject([x, y]), p) > 100) continue;
    ids.add(p.id);
  }
  return ids;
}

export function TikiMap({ places, selectedId, onSelect, camera, onCameraChange, onFrameChange, userLocation, bottomPadding = 0, flyToRequest }: Props) {
  const mapRef = useRef<MapRef>(null);
  const dark = useColorScheme();
  const [cursor, setCursor] = useState<string>("grab");
  const [skyActive, setSkyActive] = useState(false);
  const [loadedMap, setLoadedMap] = useState<MapboxMap | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSkyActive(true), SKY_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Re-apply our fog whenever a style finishes loading; a style swap would otherwise bring its own back.
  const fog = dark ? FOG_DARK : FOG_LIGHT;
  useEffect(() => {
    const map = loadedMap;
    if (!map) return;
    const apply = () => map.setFog(fog);
    if (map.isStyleLoaded()) apply();
    map.on("style.load", apply);
    return () => {
      map.off("style.load", apply);
    };
  }, [loadedMap, fog]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: places.map((p) => ({
        type: "Feature" as const,
        id: p.id,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, status: p.status, color: STATUS_COLOR[p.status], selected: p.id === selectedId ? 1 : 0 },
      })),
    }),
    [places, selectedId],
  );

  const initialView = useMemo(() => {
    if (camera) return { latitude: camera.lat, longitude: camera.lng, zoom: camera.zoom };
    return { latitude: 25, longitude: -30, zoom: 1.4 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit all places once data arrives, unless the URL already pins a camera or a place.
  const fitted = useRef(Boolean(camera) || Boolean(selectedId));
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitted.current || places.length === 0) return;
    fitted.current = true;
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: { top: 80, left: 40, right: 40, bottom: 40 + bottomPadding }, maxZoom: 12, duration: 0 });
  }, [places, bottomPadding]);

  const reportFrame = useCallback(() => {
    const map = mapRef.current;
    if (map) onFrameChange(placesInFrame(map, places, bottomPadding));
  }, [places, bottomPadding, onFrameChange]);

  useEffect(reportFrame, [reportFrame]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToRequest) return;
    if ("id" in flyToRequest) {
      const p = places.find((x) => x.id === flyToRequest.id);
      if (!p) return;
      map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13), padding: { top: 0, left: 0, right: 0, bottom: bottomPadding }, duration: 900 });
    } else {
      map.flyTo({ center: [flyToRequest.lng, flyToRequest.lat], zoom: flyToRequest.zoom, padding: { top: 0, left: 0, right: 0, bottom: bottomPadding }, duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToRequest?.nonce]);

  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current;
      const feature = e.features?.[0] as { properties?: Record<string, unknown>; geometry: { coordinates: [number, number] } } | undefined;
      if (!map || !feature) {
        onSelect(null);
        return;
      }
      if (feature.properties?.cluster) {
        const source = map.getSource("places") as GeoJSONSource | undefined;
        const clusterId = feature.properties.cluster_id as number;
        source?.getClusterExpansionZoom(clusterId, (err: Error | null | undefined, zoom: number | null | undefined) => {
          if (err || zoom == null) return;
          const [lng, lat] = feature.geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom: zoom + 0.5, duration: 600 });
        });
        return;
      }
      onSelect(feature.properties?.id as string);
    },
    [onSelect],
  );

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-elevated p-6 text-center text-sm text-fg-muted">
        Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to render the map.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <SpaceBackdrop getMap={() => mapRef.current} active={skyActive} dark={dark} />
    <Map
      ref={mapRef}
      mapboxAccessToken={TOKEN}
      mapStyle={dark ? DARK : LIGHT}
      initialViewState={initialView}
      reuseMaps
      attributionControl={false}
      cursor={cursor}
      interactiveLayerIds={["clusters", "points", "points-hit"]}
      onClick={onClick}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => setCursor("grab")}
      onLoad={(e) => {
        setLoadedMap(e.target);
        setSkyActive(true);
        reportFrame();
      }}
      onMoveEnd={(e) => {
        reportFrame();
        if ((e as { originalEvent?: unknown }).originalEvent) onCameraChange({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom });
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <Source id="places" type="geojson" data={geojson} cluster clusterMaxZoom={11} clusterRadius={44} promoteId="id">
        <Layer
          id="clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#f2a93b",
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26, 200, 32],
            "circle-stroke-width": 6,
            "circle-stroke-color": "rgba(242,169,59,0.25)",
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"] }}
          paint={{ "text-color": "#1a1206" }}
        />
        <Layer id="points-hit" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-radius": 14, "circle-opacity": 0 }} />
        <Layer
          id="points"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": ["get", "color"],
            "circle-radius": ["case", ["==", ["get", "selected"], 1], 9, 6],
            "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 4, 2],
            "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "rgba(243,233,210,0.9)", "rgba(11,20,22,0.8)"],
          }}
        />
        <Layer
          id="labels"
          type="symbol"
          minzoom={11}
          filter={["!", ["has", "point_count"]]}
          layout={{ "text-field": ["get", "name"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"], "text-optional": true }}
          paint={{ "text-color": dark ? "#f3e9d2" : "#15282b", "text-halo-color": dark ? "#0b1416" : "#f6efe0", "text-halo-width": 1.2 }}
        />
      </Source>
      {userLocation && (
        <Marker latitude={userLocation.lat} longitude={userLocation.lng}>
          <span className="block size-3.5 rounded-full bg-seaglass shadow-[0_0_0_6px_rgba(95,194,180,0.25)]" aria-label="Your location" />
        </Marker>
      )}
    </Map>
    </div>
  );
}
