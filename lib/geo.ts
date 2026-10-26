import type { Coords } from "./schema/common";

const EARTH_RADIUS_M = 6_371_000;

const toRad = (v: number) => (v * Math.PI) / 180;

export function distanceM(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export const distanceKm = (a: Coords, b: Coords) => distanceM(a, b) / 1000;

/** Grid cell key at ~1.1 km resolution, for cheap neighbour lookups. */
export function gridKey(c: Coords, cell = 0.01): string {
  return `${Math.floor(c.lat / cell)}:${Math.floor(c.lng / cell)}`;
}

export function neighbourKeys(c: Coords, cell = 0.01): string[] {
  const la = Math.floor(c.lat / cell);
  const lo = Math.floor(c.lng / cell);
  const keys: string[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) keys.push(`${la + i}:${lo + j}`);
  return keys;
}

export function roundCoord(v: number, places = 6): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}
