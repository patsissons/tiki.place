"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tiki.music";

/** `?music=0|off` still works as a one-off override for debugging and tests. */
function fromQuery(): boolean | null {
  const v = new URLSearchParams(window.location.search).get("music");
  if (v === "0" || v === "off") return false;
  if (v === "1" || v === "on") return true;
  return null;
}

function fromStorage(): boolean | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

let current: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (current === null) current = fromQuery() ?? fromStorage() ?? true;
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Saves the choice and tells every subscriber; a URL override is dropped once the person picks something. */
export function setMusicEnabled(enabled: boolean) {
  if (enabled === current) return;
  current = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the choice still applies for this page.
  }
  for (const l of listeners) l();
}

/** Whether the map's music is on. Defaults to on; the first client render matches the server. */
export function useMusicEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
