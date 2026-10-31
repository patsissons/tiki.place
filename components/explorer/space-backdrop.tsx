"use client";

import type { MapRef } from "react-map-gl/mapbox";
import { useEffect, useRef, useState } from "react";
import { useSkyMode } from "@/lib/client/sky-mode";
import { cameraBasisHor, globeCoversViewport, rotateBasis, viewOffset, type MapFrame } from "@/lib/space/camera";
import { FRAME_INTERVAL_MS, SIM_SECONDS_PER_REAL_SECOND } from "@/lib/space/constants";
import type { SpaceScene } from "@/lib/space/scene";
import { decodeStars } from "@/lib/space/stars";

type Props = {
  getMap: () => MapRef | null;
  /** True once the map has loaded (or given up); the sky never competes with first paint. */
  active: boolean;
  dark: boolean;
};

type State = "idle" | "loading" | "ready" | "unsupported";

function readFrame(map: MapRef): MapFrame {
  const canvas = map.getCanvas();
  const center = map.getCenter();
  const padding = map.getPadding();
  return {
    lat: center.lat,
    lng: center.lng,
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    zoom: map.getZoom(),
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    padding: { top: padding.top ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0, right: padding.right ?? 0 },
  };
}

type Idle = { kind: "idle"; id: number } | { kind: "timeout"; id: number };
const idle = (cb: () => void): Idle =>
  typeof window.requestIdleCallback === "function" ? { kind: "idle", id: window.requestIdleCallback(cb, { timeout: 1500 }) } : { kind: "timeout", id: window.setTimeout(cb, 0) };
const cancelIdle = (h: Idle) => (h.kind === "idle" ? window.cancelIdleCallback(h.id) : window.clearTimeout(h.id));

/**
 * The star field, Milky Way, Sun, Moon and planets behind the globe, drawn on a
 * canvas under the (transparent) Mapbox canvas and locked to its camera.
 * The mode comes from the options sheet (see `lib/client/sky-mode`): "none"
 * unmounts the scene, and the other two only change the orbital clock's speed.
 */
export function SpaceBackdrop({ getMap, active, dark }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const getMapRef = useRef(getMap);
  useEffect(() => {
    getMapRef.current = getMap;
  });
  const sceneRef = useRef<SpaceScene | null>(null);
  const [state, setState] = useState<State>("idle");
  const mode = useSkyMode();
  const enabled = mode !== "none";
  // The orbital clock restarts from now whenever the speed changes, so switching to real time snaps to the present.
  const clockRef = useRef({ start: 0, speed: SIM_SECONDS_PER_REAL_SECOND });
  useEffect(() => {
    clockRef.current = { start: Date.now(), speed: mode === "real" ? 1 : SIM_SECONDS_PER_REAL_SECOND };
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!active || !enabled || !host) return;

    let cancelled = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let scene: SpaceScene | null = null;
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setState("unsupported");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const start = async () => {
      setState("loading");
      let eph: typeof import("@/lib/space/ephemeris");
      try {
        const [{ createSpaceScene }, ephemeris, buf] = await Promise.all([
          import("@/lib/space/scene"),
          import("@/lib/space/ephemeris"),
          fetch("/space/stars.bin").then((r) => {
            if (!r.ok) throw new Error(`stars.bin ${r.status}`);
            return r.arrayBuffer();
          }),
        ]);
        if (cancelled) return;
        eph = ephemeris;
        scene = createSpaceScene(canvas, decodeStars(buf));
      } catch (err) {
        if (!cancelled) {
          console.warn("space backdrop unavailable", err);
          setState("unsupported");
        }
        return;
      }
      sceneRef.current = scene;
      scene.setScheme(dark ? "dark" : "light");

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mountedAt = Date.now();
      let last = -Infinity;
      let lastKey = "";
      let needsRedraw = true;
      let ready = false;

      const fit = () => {
        const rect = host.getBoundingClientRect();
        scene?.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), window.devicePixelRatio || 1);
        needsRedraw = true;
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(host);

      const tick = (t: number) => {
        raf = requestAnimationFrame(tick);
        const map = getMapRef.current();
        if (!map || !scene || document.hidden || t - last < FRAME_INTERVAL_MS) return;
        const f = readFrame(map);
        if (f.width === 0 || f.height === 0 || globeCoversViewport(f)) return;
        const now = Date.now();
        const { start, speed } = clockRef.current;
        const sim = reduced ? mountedAt : start + (now - start) * speed;
        const key = [f.lat, f.lng, f.bearing, f.pitch, f.zoom, f.width, f.height, f.padding.top, f.padding.bottom, f.padding.left, f.padding.right, speed].join(",");
        if (reduced && !needsRedraw && key === lastKey) return;
        const basis = rotateBasis(eph.horToEqj(new Date(now), f.lat, f.lng), cameraBasisHor(f.bearing, f.pitch));
        scene.setCamera(basis.forward, basis.up, viewOffset(f));
        scene.setBodies(eph.bodyStates(new Date(sim)), f.height);
        scene.render();
        last = t;
        lastKey = key;
        needsRedraw = false;
        if (!ready) {
          ready = true;
          canvas.style.opacity = "1";
          setState("ready");
          void scene
            .loadMilkyWay("/space/milkyway.jpg")
            .then(() => {
              needsRedraw = true;
              return scene?.loadMoonTexture("/space/moon.jpg");
            })
            .then(() => {
              needsRedraw = true;
            })
            .catch((err) => console.warn("sky textures failed", err));
        }
      };
      raf = requestAnimationFrame(tick);
    };

    const handle = idle(() => void start());

    return () => {
      cancelled = true;
      cancelIdle(handle);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene?.dispose();
      sceneRef.current = null;
      canvas.remove();
      setState("idle");
    };
    // `dark` is applied by the effect below; restarting the scene on a scheme change would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled]);

  useEffect(() => {
    sceneRef.current?.setScheme(dark ? "dark" : "light");
  }, [dark]);

  return <div ref={hostRef} data-testid="space-backdrop" data-state={state} aria-hidden className="space-fallback pointer-events-none absolute inset-0 overflow-hidden" />;
}
