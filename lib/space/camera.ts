/**
 * Pure geometry shared by the space backdrop: camera frames, padding offsets
 * and small vector helpers. No DOM, no three.js, no astronomy-engine.
 */
import { GLOBE_COVER_MARGIN, MAPBOX_TILE_SIZE } from "./constants";

export type Vec3 = readonly [number, number, number];
/**
 * A rotation in astronomy-engine's `RotationMatrix.rot` layout: `out[i] = Σ_j rot[j][i] · v[j]`
 * (the same indexing as its `RotateVector`).
 */
export type Mat3 = readonly [Vec3, Vec3, Vec3];
export type CameraBasis = { forward: Vec3; up: Vec3; right: Vec3 };
export type Padding = { top: number; bottom: number; left: number; right: number };
/** Everything the backdrop needs from the Mapbox transform. */
export type MapFrame = {
  lat: number;
  lng: number;
  bearing: number;
  pitch: number;
  zoom: number;
  width: number;
  height: number;
  padding: Padding;
};
export type ViewOffset = { fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number };

const DEG = Math.PI / 180;

export function toMat3(rot: readonly (readonly number[])[]): Mat3 {
  const row = (j: number): Vec3 => {
    const r = rot[j];
    const [a, b, c] = r ?? [];
    if (!r || r.length !== 3 || a === undefined || b === undefined || c === undefined) throw new Error("expected a 3x3 matrix");
    return [a, b, c];
  };
  return [row(0), row(1), row(2)];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize(v: Vec3): Vec3 {
  const n = length(v);
  return n === 0 ? [0, 0, 0] : scale(v, 1 / n);
}

/** Angle between two directions in degrees. */
export function angleDeg(a: Vec3, b: Vec3): number {
  const c = dot(normalize(a), normalize(b));
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

export function raDecToUnit(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

export function unitToRaDec(v: Vec3): { ra: number; dec: number } {
  const n = normalize(v);
  const ra = (Math.atan2(n[1], n[0]) / DEG + 360) % 360;
  return { ra, dec: Math.asin(Math.min(1, Math.max(-1, n[2]))) / DEG };
}

export function applyRotation(rot: Mat3, v: Vec3): Vec3 {
  return [
    rot[0][0] * v[0] + rot[1][0] * v[1] + rot[2][0] * v[2],
    rot[0][1] * v[0] + rot[1][1] * v[1] + rot[2][1] * v[2],
    rot[0][2] * v[0] + rot[1][2] * v[1] + rot[2][2] * v[2],
  ];
}

export function rotateBasis(rot: Mat3, b: CameraBasis): CameraBasis {
  return { forward: applyRotation(rot, b.forward), up: applyRotation(rot, b.up), right: applyRotation(rot, b.right) };
}

/**
 * The Mapbox camera's axes in astronomy-engine's horizontal frame
 * (x = north, y = west, z = zenith) for the map centre.
 *
 * Bearing is the compass direction that points up the screen (clockwise from
 * north). Pitch tilts the camera so it looks toward the top of the screen; at
 * zero pitch it looks straight down at the centre.
 */
export function cameraBasisHor(bearingDeg: number, pitchDeg: number): CameraBasis {
  const b = bearingDeg * DEG;
  const p = pitchDeg * DEG;
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return {
    forward: [cb * sp, -sb * sp, -cp],
    up: [cb * cp, -sb * cp, sp],
    right: [-sb, -cb, 0],
  };
}

/** Where Mapbox puts the centre point relative to the middle of the canvas (screen px, y down). */
export function centerOffset(f: MapFrame): { x: number; y: number } {
  return { x: (f.padding.left - f.padding.right) / 2, y: (f.padding.top - f.padding.bottom) / 2 };
}

/**
 * Arguments for three's `PerspectiveCamera.setViewOffset` that move the
 * principal point to the padded centre, mirroring Mapbox's projection shift.
 */
export function viewOffset(f: MapFrame): ViewOffset {
  const { x, y } = centerOffset(f);
  return { fullWidth: f.width, fullHeight: f.height, offsetX: -x, offsetY: -y, width: f.width, height: f.height };
}

/** Pixel radius of the globe at a zoom level (circumference = tileSize · 2^zoom). */
export function globeRadiusPx(zoom: number): number {
  return (MAPBOX_TILE_SIZE * 2 ** zoom) / (2 * Math.PI);
}

/** True once the globe hides every corner of the canvas, so nothing behind it can show. */
export function globeCoversViewport(f: MapFrame, margin = GLOBE_COVER_MARGIN): boolean {
  const { x, y } = centerOffset(f);
  const cx = f.width / 2 + x;
  const cy = f.height / 2 + y;
  const farthest = Math.max(Math.hypot(cx, cy), Math.hypot(f.width - cx, cy), Math.hypot(cx, f.height - cy), Math.hypot(f.width - cx, f.height - cy));
  return globeRadiusPx(f.zoom) >= farthest * margin;
}
