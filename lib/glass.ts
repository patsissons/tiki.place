import type { CSSProperties } from "react";

const COUNTRY_ZOOM_THRESHOLD = 4.2;
const SPACE_ZOOM = 2.4;
const EXPONENTIAL_POWER = 3.6;

type GlassStyleVars = CSSProperties & {
  "--glass-bg-opacity": string;
  "--glass-hover-bg-opacity": string;
  "--glass-border-opacity": string;
  "--glass-panel-bg-opacity": string;
  "--glass-card-bg-opacity": string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toOpacity(value: number) {
  return value.toFixed(3);
}

export function getGlassIntensity(zoom: number) {
  const progress = clamp(
    (COUNTRY_ZOOM_THRESHOLD - zoom) / (COUNTRY_ZOOM_THRESHOLD - SPACE_ZOOM),
    0,
    1,
  );

  return Math.expm1(progress * EXPONENTIAL_POWER) / Math.expm1(EXPONENTIAL_POWER);
}

export function getGlassSurfaceStyle(zoom: number): GlassStyleVars {
  const intensity = getGlassIntensity(zoom);

  return {
    "--glass-bg-opacity": toOpacity(0.22 + intensity * 0.56),
    "--glass-hover-bg-opacity": toOpacity(0.32 + intensity * 0.56),
    "--glass-border-opacity": toOpacity(0.34 + intensity * 0.32),
    "--glass-panel-bg-opacity": toOpacity(0.18 + intensity * 0.5),
    "--glass-card-bg-opacity": toOpacity(0.28 + intensity * 0.54),
  };
}
