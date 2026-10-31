/**
 * Thin wrapper over astronomy-engine. Everything comes back as unit vectors in
 * the J2000 equatorial frame (EQJ), which is also the three.js world frame of
 * the backdrop: +Z is the celestial north pole, +X points at the vernal equinox.
 */
import { Body, Illumination, MakeTime, Observer, Rotation_EQD_EQJ, Rotation_HOR_EQJ, SiderealTime, type Vector } from "astronomy-engine";
import { normalize, raDecToUnit, scale, toMat3, type Mat3, type Vec3 } from "./camera";

export type BodyId = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune";

export type BodyState = {
  id: BodyId;
  /** Geocentric direction (EQJ, unit). */
  dir: Vec3;
  /** Direction from the body toward the Sun (EQJ, unit); drives the lit hemisphere. */
  toSun: Vec3;
  /** True apparent diameter as seen from Earth, degrees. */
  angularDiameterDeg: number;
  /** Apparent visual magnitude. */
  mag: number;
  /** Fraction of the disc that is lit, 0..1. */
  phaseFraction: number;
  distanceAu: number;
};

const DEG = Math.PI / 180;
const AU_KM = 149_597_870.7;

const BODIES: ReadonlyArray<{ id: BodyId; body: Body; radiusKm: number }> = [
  { id: "sun", body: Body.Sun, radiusKm: 695_700 },
  { id: "moon", body: Body.Moon, radiusKm: 1_737.4 },
  { id: "mercury", body: Body.Mercury, radiusKm: 2_439.7 },
  { id: "venus", body: Body.Venus, radiusKm: 6_051.8 },
  { id: "mars", body: Body.Mars, radiusKm: 3_389.5 },
  { id: "jupiter", body: Body.Jupiter, radiusKm: 69_911 },
  { id: "saturn", body: Body.Saturn, radiusKm: 58_232 },
  { id: "uranus", body: Body.Uranus, radiusKm: 25_362 },
  { id: "neptune", body: Body.Neptune, radiusKm: 24_622 },
];

/** J2000 north poles (IAU), used to orient textures and Saturn's ring. */
export const SATURN_POLE: Vec3 = raDecToUnit(40.589, 83.537);
export const MOON_POLE: Vec3 = raDecToUnit(266.86, 65.64);

function unit(v: Vector): Vec3 {
  return normalize([v.x, v.y, v.z]);
}

/** Rotation from the local horizontal frame (x north, y west, z zenith) at lat/lng to EQJ. */
export function horToEqj(date: Date, lat: number, lng: number): Mat3 {
  return toMat3(Rotation_HOR_EQJ(date, new Observer(lat, lng, 0)).rot);
}

/** Rotation from the equator-of-date frame to EQJ (precession and nutation). */
export function eqdToEqj(date: Date): Mat3 {
  return toMat3(Rotation_EQD_EQJ(date).rot);
}

/** Greenwich apparent sidereal time in degrees. */
export function gastDeg(date: Date): number {
  return SiderealTime(date) * 15;
}

/** Geocentric state of every body the backdrop draws, at the simulated time. */
export function bodyStates(simDate: Date): BodyState[] {
  const time = MakeTime(simDate);
  return BODIES.map(({ id, body, radiusKm }) => {
    const ill = Illumination(body, time);
    const dir = unit(ill.gc);
    const distanceAu = ill.gc.Length();
    // The Sun lights itself: face the viewer. For everything else, light comes from minus the heliocentric vector.
    const toSun = id === "sun" ? scale(dir, -1) : scale(unit(ill.hc), -1);
    return {
      id,
      dir,
      toSun,
      angularDiameterDeg: (2 * Math.atan(radiusKm / (distanceAu * AU_KM))) / DEG,
      mag: ill.mag,
      phaseFraction: ill.phase_fraction,
      distanceAu,
    };
  });
}
