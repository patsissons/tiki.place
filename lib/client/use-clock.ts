"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      current = Date.now();
      for (const l of listeners) l();
    }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Minute-granular clock. Returns null during SSR and the first client render, so open/closed text never mismatches. */
export function useClock(): Date | null {
  const ms = useSyncExternalStore(subscribe, () => current, () => 0);
  return ms === 0 ? null : new Date(ms);
}
