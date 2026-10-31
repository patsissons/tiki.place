"use client";

import type { MapRef } from "react-map-gl/mapbox";

type Props = {
  getMap: () => MapRef | null;
  /** True once the map has loaded (or given up); the sky never competes with first paint. */
  active: boolean;
  dark: boolean;
};

export function SpaceBackdrop(_props: Props) {
  return <div data-testid="space-backdrop" data-state="idle" aria-hidden className="space-fallback pointer-events-none absolute inset-0" />;
}
