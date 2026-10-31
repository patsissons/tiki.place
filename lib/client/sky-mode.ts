"use client";

import { useSyncExternalStore } from "react";

/**
 * How the sky behind the globe runs: off, on the real clock, or with the
 * orbital clock sped up so the Moon visibly orbits (the default).
 */
export type SkyMode = "none" | "real" | "accelerated";

export const SKY_MODES: readonly SkyMode[] = ["none", "real", "accelerated"];
export const DEFAULT_SKY_MODE: SkyMode = "accelerated";
const STORAGE_KEY = "tiki.sky-mode";

const isSkyMode = (v: unknown): v is SkyMode => (SKY_MODES as readonly unknown[]).includes(v);

/** `?sky=0|off|none`, `?sky=real` and `?sky=fast|accelerated` still work as one-off overrides for debugging and tests. */
function fromQuery(): SkyMode | null {
  const v = new URLSearchParams(window.location.search).get("sky");
  if (v === "0" || v === "off" || v === "none") return "none";
  if (v === "real") return "real";
  if (v === "fast" || v === "accelerated") return "accelerated";
  return null;
}

function fromStorage(): SkyMode | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isSkyMode(v) ? v : null;
  } catch {
    return null;
  }
}

let current: SkyMode | null = null;
const listeners = new Set<() => void>();

function read(): SkyMode {
  if (current === null) current = fromQuery() ?? fromStorage() ?? DEFAULT_SKY_MODE;
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Saves the choice and tells every subscriber; a URL override is dropped once the person picks something. */
export function setSkyMode(mode: SkyMode) {
  if (!isSkyMode(mode) || mode === current) return;
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice still applies for this page.
  }
  for (const l of listeners) l();
}

/** The current sky mode. The server and the first client render see the default, so the explorer never mismatches on hydration. */
export function useSkyMode(): SkyMode {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SKY_MODE);
}
