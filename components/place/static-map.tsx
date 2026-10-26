"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Marker } from "react-map-gl/mapbox";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export function StaticMap({ lat, lng, zoom = 14 }: { lat: number; lng: number; zoom?: number }) {
  if (!TOKEN) return <div className="aspect-[4/3] bg-bg-elevated" />;
  return (
    <div className="aspect-[4/3]">
      <Map
        mapboxAccessToken={TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{ latitude: lat, longitude: lng, zoom }}
        interactive={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <Marker latitude={lat} longitude={lng}>
          <span className="block size-4 rounded-full bg-amber shadow-[0_0_0_6px_rgba(242,169,59,0.3)]" />
        </Marker>
      </Map>
    </div>
  );
}
