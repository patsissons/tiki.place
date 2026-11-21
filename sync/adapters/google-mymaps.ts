/**
 * A public Google My Map, read through its KML export (one request per run). Built for
 * "All The Tiki Bars", the community map that The Tiki Atlas imports from; any other
 * public map works with its own `mid` and layer rules.
 *
 * Facts only: name, coordinates and layer. Placemark descriptions are the map
 * author's notes and are never stored. KML placemarks have no ids, so a placemark's
 * ref is a hash of its name and rounded coordinates. Every derived place links back
 * to the map.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Observation } from "@/lib/schema";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations } from "./types";

const ConfigSchema = z.object({
  mid: z.string().min(10),
  /** Layers whose placemarks vouch for a tiki place (tag tiki-directory). */
  vouchLayers: z.array(z.string()).default([]),
  /** Layers whose placemarks only add attribution to places we already have. Unlisted layers are skipped. */
  attachLayers: z.array(z.string()).default([]),
});

export type Placemark = { layer: string; name: string; lat: number; lng: number };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Point placemarks with their folder (layer) name. Descriptions are deliberately not read. */
export function parseKml(kml: string): Placemark[] {
  const out: Placemark[] = [];
  for (const folder of kml.split("<Folder>").slice(1)) {
    const layer = decode(/<name>([\s\S]*?)<\/name>/.exec(folder)?.[1] ?? "");
    for (const pm of folder.split("<Placemark>").slice(1)) {
      const name = decode(/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1] ?? "");
      const coords = /<Point>[\s\S]*?<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(pm);
      if (!name || !coords) continue;
      const lng = Number(coords[1]);
      const lat = Number(coords[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      out.push({ layer, name, lat, lng });
    }
  }
  return out;
}

export function placemarkRef(p: Placemark): string {
  return createHash("sha1").update(`${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`).digest("hex").slice(0, 12);
}

export const viewerUrl = (mid: string) => `https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(mid)}`;
export const kmlUrl = (mid: string) => `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;

export function placemarkToObservation(sourceId: string, mid: string, p: Placemark, vouch: boolean, observedAt: string): Observation {
  return makeObservation({
    sourceId,
    sourceRef: placemarkRef(p),
    url: viewerUrl(mid),
    name: p.name,
    coords: { lat: p.lat, lng: p.lng },
    coordsPrecision: "rooftop",
    statusHint: null,
    tags: vouch ? ["tiki-directory"] : [],
    observedAt,
  });
}

export const googleMyMapsAdapter: Adapter = {
  id: "google-mymaps",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const res = await ctx.fetch(kmlUrl(config.mid), { accept: "application/vnd.google-earth.kml+xml,application/xml,text/xml;q=0.9" });
    if (res.status !== 200 || !res.body.includes("<kml")) throw new Error(`KML export returned ${res.status}`);
    const placemarks = parseKml(res.body);
    const observedAt = ctx.now.toISOString();
    const byRef = new Map<string, Observation>();
    for (const p of placemarks) {
      const vouch = config.vouchLayers.includes(p.layer);
      if (!vouch && !config.attachLayers.includes(p.layer)) continue;
      const obs = placemarkToObservation(ctx.source.id, config.mid, p, vouch, observedAt);
      if (!byRef.has(obs.sourceRef)) byRef.set(obs.sourceRef, obs);
    }
    if (byRef.size < 50) throw new Error(`KML yielded only ${byRef.size} placemarks in the configured layers; has the map changed?`);
    return { observations: reconcileObservations(ctx.prior, [...byRef.values()]), complete: true };
  },
};
