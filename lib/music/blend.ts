/** Both loops run for exactly this long, so they stay locked together forever. */
export const LOOP_SECONDS = 24;
export const MUSIC_FILES = { space: "/music/space.m4a", aloha: "/music/aloha.m4a" } as const;

/** Below this map zoom only the space loop plays. */
export const BLEND_START_ZOOM = 3;
/** Above this map zoom only the aloha loop plays. */
export const BLEND_END_ZOOM = 9;

/** How far the map has zoomed into the aloha music, from 0 (space) to 1 (aloha), eased at both ends. */
export function blendAtZoom(zoom: number): number {
  const x = Math.min(1, Math.max(0, (zoom - BLEND_START_ZOOM) / (BLEND_END_ZOOM - BLEND_START_ZOOM)));
  return x * x * (3 - 2 * x);
}

/** Equal-power gains for each loop, so the overall loudness holds steady through the crossfade. */
export function gainsAtZoom(zoom: number): { space: number; aloha: number } {
  const t = blendAtZoom(zoom);
  return { space: Math.cos((t * Math.PI) / 2), aloha: Math.sin((t * Math.PI) / 2) };
}
