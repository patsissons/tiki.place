/**
 * Compact star catalogue codec shared by the build script, the client and tests.
 *
 * Layout (little-endian): a 16-byte header — "TKST", u16 version, u16 reserved,
 * u32 count, 4 reserved bytes — then 8 bytes per star: u16 RA (0..65535 ↔ 0..360°),
 * i16 Dec (±32767 ↔ ±90°), i16 magnitude × 100, u8 spectral class, u8 padding.
 * Twenty arcseconds of precision is far below a pixel at any zoom that shows space.
 */
import { raDecToUnit } from "./camera";

export type StarInput = { raDeg: number; decDeg: number; mag: number; spectral: string };
export type StarSet = {
  count: number;
  /** xyz unit vectors in EQJ, 3 floats per star. */
  positions: Float32Array;
  mags: Float32Array;
  /** 0..6 for O B A F G K M, 7 when unknown. */
  classes: Uint8Array;
};

export const STAR_FORMAT_VERSION = 1;
export const STAR_HEADER_BYTES = 16;
export const STAR_RECORD_BYTES = 8;
const MAGIC = "TKST";
const CLASSES = "OBAFGKM";

/** Approximate sRGB tints per spectral class (plus a neutral fallback), 0..1. */
export const SPECTRAL_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [155 / 255, 176 / 255, 1], // O
  [170 / 255, 191 / 255, 1], // B
  [202 / 255, 215 / 255, 1], // A
  [248 / 255, 247 / 255, 1], // F
  [1, 244 / 255, 234 / 255], // G
  [1, 210 / 255, 161 / 255], // K
  [1, 204 / 255, 111 / 255], // M
  [1, 240 / 255, 220 / 255], // unknown
];

function parseSexagesimal(text: string): number {
  const trimmed = text.trim();
  const negative = trimmed.startsWith("-");
  const parts = trimmed.replace(/^[+-]/, "").split(":");
  if (parts.length !== 3) throw new Error(`bad sexagesimal value: ${text}`);
  const [a, b, c] = parts.map(Number);
  if (a === undefined || b === undefined || c === undefined || [a, b, c].some((n) => !Number.isFinite(n))) throw new Error(`bad sexagesimal value: ${text}`);
  const value = a + b / 60 + c / 3600;
  return negative ? -value : value;
}

/** "HH:MM:SS.ss" → degrees. */
export function parseRa(hms: string): number {
  return parseSexagesimal(hms) * 15;
}

/** "±DD:MM:SS.ss" → degrees; keeps the sign of "-00:30:00". */
export function parseDec(dms: string): number {
  return parseSexagesimal(dms);
}

/** Spectral class index from a type string such as "A1Vn", "gK0" or "dM2e". */
export function spectralClass(spectral: string): number {
  const s = spectral.trim();
  for (let i = 0; i < Math.min(s.length, 4); i++) {
    const idx = CLASSES.indexOf(s.charAt(i));
    if (idx >= 0) return idx;
  }
  // Carbon and S-type stars are red.
  if (/^(C|S|N|R)/.test(s)) return 6;
  return 7;
}

export function encodeStars(stars: readonly StarInput[]): ArrayBuffer {
  const buf = new ArrayBuffer(STAR_HEADER_BYTES + stars.length * STAR_RECORD_BYTES);
  const view = new DataView(buf);
  for (let i = 0; i < 4; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint16(4, STAR_FORMAT_VERSION, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, stars.length, true);
  view.setUint32(12, 0, true);
  stars.forEach((s, i) => {
    const o = STAR_HEADER_BYTES + i * STAR_RECORD_BYTES;
    const ra = (((s.raDeg % 360) + 360) % 360) / 360;
    view.setUint16(o, Math.round(ra * 65536) % 65536, true);
    view.setInt16(o + 2, Math.round(Math.max(-1, Math.min(1, s.decDeg / 90)) * 32767), true);
    view.setInt16(o + 4, Math.round(s.mag * 100), true);
    view.setUint8(o + 6, spectralClass(s.spectral));
    view.setUint8(o + 7, 0);
  });
  return buf;
}

export function decodeStars(buf: ArrayBuffer): StarSet {
  const view = new DataView(buf);
  if (buf.byteLength < STAR_HEADER_BYTES) throw new Error("star file too short");
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error("not a star file");
  const version = view.getUint16(4, true);
  if (version !== STAR_FORMAT_VERSION) throw new Error(`unsupported star file version ${version}`);
  const count = view.getUint32(8, true);
  if (buf.byteLength < STAR_HEADER_BYTES + count * STAR_RECORD_BYTES) throw new Error("star file truncated");
  const positions = new Float32Array(count * 3);
  const mags = new Float32Array(count);
  const classes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = STAR_HEADER_BYTES + i * STAR_RECORD_BYTES;
    const ra = (view.getUint16(o, true) / 65536) * 360;
    const dec = (view.getInt16(o + 2, true) / 32767) * 90;
    const [x, y, z] = raDecToUnit(ra, dec);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    mags[i] = view.getInt16(o + 4, true) / 100;
    classes[i] = view.getUint8(o + 6);
  }
  return { count, positions, mags, classes };
}
