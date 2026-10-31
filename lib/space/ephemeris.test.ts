import { RotateVector, RotationMatrix } from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { angleDeg, applyRotation, cameraBasisHor, rotateBasis, unitToRaDec, type Vec3 } from "./camera";
import { bodyStates, eqdToEqj, gastDeg, horToEqj } from "./ephemeris";

const DEG = Math.PI / 180;

describe("bodyStates", () => {
  it("puts the Sun where it belongs at J2000.0", () => {
    const sun = bodyStates(new Date("2000-01-01T12:00:00Z")).find((b) => b.id === "sun")!;
    const { ra, dec } = unitToRaDec(sun.dir);
    expect(ra).toBeCloseTo(281.29, 0);
    expect(dec).toBeCloseTo(-23.03, 0);
    expect(sun.angularDiameterDeg).toBeGreaterThan(0.52);
    expect(sun.angularDiameterDeg).toBeLessThan(0.55);
  });

  it("shows a full Moon opposite the Sun on 2024-12-15", () => {
    const states = bodyStates(new Date("2024-12-15T09:02:00Z"));
    const moon = states.find((b) => b.id === "moon")!;
    const sun = states.find((b) => b.id === "sun")!;
    expect(angleDeg(moon.dir, sun.dir)).toBeGreaterThan(170);
    expect(moon.phaseFraction).toBeGreaterThan(0.97);
    expect(moon.angularDiameterDeg).toBeGreaterThan(0.48);
    expect(moon.angularDiameterDeg).toBeLessThan(0.57);
    // Light reaches the Moon from the Sun's side.
    expect(angleDeg(moon.toSun, sun.dir)).toBeLessThan(2);
  });

  it("returns every body with unit vectors", () => {
    const states = bodyStates(new Date("2026-10-30T00:00:00Z"));
    expect(states.map((s) => s.id)).toEqual(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]);
    for (const s of states) {
      expect(Math.hypot(...s.dir)).toBeCloseTo(1, 9);
      expect(Math.hypot(...s.toSun)).toBeCloseTo(1, 9);
      expect(s.phaseFraction).toBeGreaterThanOrEqual(0);
      expect(s.phaseFraction).toBeLessThanOrEqual(1);
    }
  });
});

describe("horToEqj", () => {
  const date = new Date("2026-10-30T03:00:00Z");
  const lat = 37.77;
  const lng = -122.42;

  it("sends the zenith to Dec ≈ latitude and RA ≈ GAST + longitude", () => {
    const { ra, dec } = unitToRaDec(applyRotation(horToEqj(date, lat, lng), [0, 0, 1]));
    expect(Math.abs(dec - lat)).toBeLessThan(0.5); // precession since J2000 is a few tenths of a degree
    const expectedRa = (((gastDeg(date) + lng) % 360) + 360) % 360;
    const diff = Math.abs(((ra - expectedRa + 540) % 360) - 180);
    expect(diff).toBeLessThan(0.5);
  });

  it("agrees with an explicit ECEF → Rz(GAST) → EQD → EQJ derivation", () => {
    const bearing = 37;
    const pitch = 25;
    const viaLibrary = rotateBasis(horToEqj(date, lat, lng), cameraBasisHor(bearing, pitch));

    const φ = lat * DEG;
    const λ = lng * DEG;
    const r: Vec3 = [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
    const e: Vec3 = [-Math.sin(λ), Math.cos(λ), 0];
    const n: Vec3 = [-Math.sin(φ) * Math.cos(λ), -Math.sin(φ) * Math.sin(λ), Math.cos(φ)];
    const b = bearing * DEG;
    const p = pitch * DEG;
    const lin = (a: Vec3, ka: number, c: Vec3, kc: number): Vec3 => [a[0] * ka + c[0] * kc, a[1] * ka + c[1] * kc, a[2] * ka + c[2] * kc];
    const upGround = lin(n, Math.cos(b), e, Math.sin(b));
    const forwardEcef = lin(r, -Math.cos(p), upGround, Math.sin(p));
    const upEcef = lin(r, Math.sin(p), upGround, Math.cos(p));

    const gast = gastDeg(date) * DEG;
    const rz = (v: Vec3): Vec3 => [v[0] * Math.cos(gast) - v[1] * Math.sin(gast), v[0] * Math.sin(gast) + v[1] * Math.cos(gast), v[2]];
    const eqd2eqj = eqdToEqj(date);
    const toEqj = (v: Vec3) => applyRotation(eqd2eqj, rz(v));

    expect(angleDeg(viaLibrary.forward, toEqj(forwardEcef))).toBeLessThan(1e-6);
    expect(angleDeg(viaLibrary.up, toEqj(upEcef))).toBeLessThan(1e-6);
  });

  it("uses the same matrix indexing as astronomy-engine's RotateVector", () => {
    const m = horToEqj(date, lat, lng);
    const v: Vec3 = [0.3, -0.5, 0.8];
    const ours = applyRotation(m, v);
    const theirs = RotateVector(new RotationMatrix(m.map((row) => [...row])), { x: v[0], y: v[1], z: v[2] } as never);
    expect(ours[0]).toBeCloseTo(theirs.x, 12);
    expect(ours[1]).toBeCloseTo(theirs.y, 12);
    expect(ours[2]).toBeCloseTo(theirs.z, 12);
  });
});
