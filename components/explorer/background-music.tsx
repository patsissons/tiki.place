"use client";

import type { Map as MapboxMap } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { useMusicEnabled } from "@/lib/client/music";
import { createMusicPlayer, type MusicPlayer, type MusicState } from "@/lib/music/player";

/** The events browsers accept as permission to start sound; which ones count differs between them and between mouse and touch. */
const GESTURES = ["pointerup", "touchend", "mousedown", "click", "keydown"] as const;

const hasFocus = () => !document.hidden && document.hasFocus();

/**
 * Plays the zoom-blended music while the explorer is open and focused. Browsers
 * refuse sound until the person interacts, so it starts on their first tap,
 * click or key press, and nothing downloads before then. The music toggle is
 * skipped as a gesture: turning the music off should not fetch it first.
 */
export function BackgroundMusic({ map }: { map: MapboxMap | null }) {
  const enabled = useMusicEnabled();
  const [state, setState] = useState<MusicState>("idle");
  const playerRef = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    const player = createMusicPlayer(setState);
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!map || !player) return;
    const apply = () => player.setZoom(map.getZoom());
    apply();
    // "move" fires on every frame of a drag, a pinch and a fly-to alike.
    map.on("move", apply);
    return () => {
      map.off("move", apply);
    };
  }, [map]);

  useEffect(() => {
    const player = playerRef.current;
    if (!enabled || !player) return;

    const onGesture = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-music-toggle]")) return;
      player.play();
    };
    const syncFocus = () => {
      if (!hasFocus()) player.pause();
      else if (player.unlocked()) player.play();
    };

    // Turned back on: the click on the toggle is the gesture, when the browser can tell us so.
    if (hasFocus() && (player.unlocked() || navigator.userActivation?.isActive)) player.play();

    for (const type of GESTURES) document.addEventListener(type, onGesture, { capture: true, passive: true });
    document.addEventListener("visibilitychange", syncFocus);
    window.addEventListener("blur", syncFocus);
    window.addEventListener("focus", syncFocus);
    window.addEventListener("pagehide", syncFocus);
    window.addEventListener("pageshow", syncFocus);
    return () => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture, { capture: true });
      document.removeEventListener("visibilitychange", syncFocus);
      window.removeEventListener("blur", syncFocus);
      window.removeEventListener("focus", syncFocus);
      window.removeEventListener("pagehide", syncFocus);
      window.removeEventListener("pageshow", syncFocus);
      player.mute();
    };
  }, [enabled]);

  return <span hidden data-testid="background-music" data-state={state} />;
}
