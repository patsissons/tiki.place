#!/usr/bin/env tsx
/**
 * Build the static sky assets under public/space. Run by hand, never by `build`.
 *
 *   pnpm space:build [--offline]
 *
 * Sources (cached under .cache/space):
 *   - Yale Bright Star Catalog v5 as JSON (public domain), → stars.bin
 *   - NASA/Goddard SVS "Deep Star Maps 2020" Milky Way, celestial coordinates,
 *     4k EXR (34 MB) → milkyway.jpg, via ffmpeg
 *   - Solar System Scope 2k Moon texture (CC BY 4.0) → moon.jpg, via ffmpeg
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { encodeStars, parseDec, parseRa, type StarInput } from "../lib/space/stars";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache", "space");
const OUT = path.join(ROOT, "public", "space");

const SOURCES = {
  bsc: "https://raw.githubusercontent.com/prichmp/Bright-Star-Catalog-JSON/master/BSC.json",
  milkyway: "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k.exr",
  moon: "https://www.solarsystemscope.com/textures/download/2k_moon.jpg",
};

const { values } = parseArgs({ options: { offline: { type: "boolean", default: false } } });

async function cached(name: string, url: string): Promise<string | null> {
  const file = path.join(CACHE, name);
  if (existsSync(file)) return file;
  if (values.offline) {
    console.warn(`! missing ${file} (offline, skipped)`);
    return null;
  }
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function writeIfChanged(file: string, data: Buffer): void {
  const rel = path.relative(ROOT, file);
  if (existsSync(file) && readFileSync(file).equals(data)) {
    console.log(`= ${rel} unchanged (${data.length.toLocaleString()} bytes)`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`✓ wrote ${rel} (${data.length.toLocaleString()} bytes)`);
}

/** Run ffmpeg to a temp file and return its bytes. */
function ffmpeg(args: string[], ext: string): Buffer {
  const tmp = path.join(CACHE, `tmp-${process.pid}.${ext}`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, tmp], { stdio: "inherit" });
  const data = readFileSync(tmp);
  execFileSync("rm", ["-f", tmp]);
  return data;
}

async function buildStars(): Promise<void> {
  const file = await cached("BSC.json", SOURCES.bsc);
  if (!file) return;
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>[];
  const stars: StarInput[] = [];
  let skipped = 0;
  for (const row of raw) {
    try {
      const mag = Number(row["MAG"]);
      if (!Number.isFinite(mag)) throw new Error("bad magnitude");
      stars.push({ raDeg: parseRa(row["RA"] ?? ""), decDeg: parseDec(row["DEC"] ?? ""), mag, spectral: row["Title HD"] ?? "" });
    } catch {
      skipped++;
    }
  }
  stars.sort((a, b) => a.mag - b.mag);
  console.log(`  ${stars.length} stars (${skipped} skipped)`);
  writeIfChanged(path.join(OUT, "stars.bin"), Buffer.from(encodeStars(stars)));
}

async function buildMilkyWay(): Promise<void> {
  const file = await cached("milkyway_2020_4k.exr", SOURCES.milkyway);
  if (!file) return;
  // Linear EXR → sRGB, halve the resolution, lift the faint band a little.
  const data = ffmpeg(["-apply_trc", "iec61966_2_1", "-i", file, "-vf", "scale=2048:1024:flags=lanczos", "-q:v", "5"], "jpg");
  writeIfChanged(path.join(OUT, "milkyway.jpg"), data);
}

async function buildMoon(): Promise<void> {
  const file = await cached("2k_moon.jpg", SOURCES.moon);
  if (!file) return;
  const data = ffmpeg(["-i", file, "-vf", "scale=512:256:flags=lanczos", "-q:v", "4"], "jpg");
  writeIfChanged(path.join(OUT, "moon.jpg"), data);
}

await buildStars();
await buildMilkyWay();
await buildMoon();
