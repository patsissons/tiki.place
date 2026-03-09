import type { TikiBar } from "@/lib/data-schema";

export type Coordinates = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: Coordinates, b: Coordinates) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function findNearestBar(location: Coordinates, bars: TikiBar[]) {
  return bars.reduce<{ bar: TikiBar; distanceKm: number } | null>((nearest, bar) => {
    const distanceKm = haversineDistanceKm(location, bar.coordinates);
    if (!nearest || distanceKm < nearest.distanceKm) {
      return { bar, distanceKm };
    }
    return nearest;
  }, null);
}
