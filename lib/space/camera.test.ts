import { describe, expect, it } from "vitest";
import { angleDeg, applyRotation, cameraBasisHor, centerOffset, cross, dot, globeCoversViewport, length, raDecToUnit, toMat3, unitToRaDec, viewOffset, type MapFrame, type Vec3 } from "./camera";

const close = (a: Vec3, b: Vec3, eps = 1e-12) => {
  expect(Math.abs(a[0] - b[0])).toBeLessThan(eps);
  expect(Math.abs(a[1] - b[1])).toBeLessThan(eps);
  expect(Math.abs(a[2] - b[2])).toBeLessThan(eps);
};

const frame = (over: Partial<MapFrame> = {}): MapFrame => ({
  lat: 0,
  lng: 0,
  bearing: 0,
  pitch: 0,
  zoom: 1.4,
  width: 1920,
  height: 1080,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
  ...over,
});

describe("cameraBasisHor", () => {
  it("looks straight down with north up at bearing 0, pitch 0", () => {
    const b = cameraBasisHor(0, 0);
    close(b.forward, [0, 0, -1]);
    close(b.up, [1, 0, 0]);
    close(b.right, [0, -1, 0]);
  });

  it("puts east up the screen at bearing 90", () => {
    const b = cameraBasisHor(90, 0);
    close(b.up, [0, -1, 0]); // east is -west
    close(b.right, [-1, 0, 0]); // south
  });

  it("tilts the view toward the top of the screen with pitch", () => {
    const b = cameraBasisHor(0, 45);
    const s = Math.SQRT1_2;
    close(b.forward, [s, 0, -s]);
    close(b.up, [s, 0, s]);
  });

  it("is a right-handed orthonormal camera frame for any bearing and pitch", () => {
    const cases: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [37, 12],
      [200, 60],
      [-45, 85],
    ];
    for (const [bearing, pitch] of cases) {
      const b = cameraBasisHor(bearing, pitch);
      expect(length(b.forward)).toBeCloseTo(1, 12);
      expect(length(b.up)).toBeCloseTo(1, 12);
      expect(length(b.right)).toBeCloseTo(1, 12);
      expect(dot(b.forward, b.up)).toBeCloseTo(0, 12);
      expect(dot(b.forward, b.right)).toBeCloseTo(0, 12);
      expect(dot(b.up, b.right)).toBeCloseTo(0, 12);
      close(cross(b.right, b.up), [-b.forward[0], -b.forward[1], -b.forward[2]]);
    }
  });
});

describe("applyRotation", () => {
  it("follows astronomy-engine's RotateVector indexing", () => {
    // A rotation of +90° about z in astronomy-engine layout maps x to y.
    const rot = toMat3([
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ]);
    close(applyRotation(rot, [1, 0, 0]), [0, 1, 0]);
    close(applyRotation(rot, [0, 1, 0]), [-1, 0, 0]);
  });

  it("rejects malformed matrices", () => {
    expect(() => toMat3([[1, 0], [0, 1]])).toThrow();
  });
});

describe("padding offsets", () => {
  it("matches Mapbox's centre shift for the explorer's desktop and mobile paddings", () => {
    expect(centerOffset(frame({ padding: { top: 80, left: 40, right: 40, bottom: 40 } }))).toEqual({ x: 0, y: 20 });
    expect(centerOffset(frame({ padding: { top: 80, left: 40, right: 40, bottom: 40 + 354 } }))).toEqual({ x: 0, y: -157 });
  });

  it("negates the shift for three's view offset", () => {
    const v = viewOffset(frame({ width: 390, height: 844, padding: { top: 80, left: 60, right: 40, bottom: 394 } }));
    expect(v).toEqual({ fullWidth: 390, fullHeight: 844, offsetX: -10, offsetY: 157, width: 390, height: 844 });
  });
});

describe("globeCoversViewport", () => {
  it("is false while space is visible and true once the globe fills the canvas", () => {
    expect(globeCoversViewport(frame({ zoom: 1.4 }))).toBe(false);
    expect(globeCoversViewport(frame({ zoom: 3.0 }))).toBe(false);
    expect(globeCoversViewport(frame({ zoom: 4.2 }))).toBe(true);
    expect(globeCoversViewport(frame({ zoom: 2.4, width: 390, height: 844 }))).toBe(false);
    expect(globeCoversViewport(frame({ zoom: 3.3, width: 390, height: 844 }))).toBe(true);
  });

  it("accounts for a padded centre near one edge", () => {
    // Zoom 3.3 gives a radius of about 800 px: enough from the middle of a phone, not from a centre pushed near the top.
    const padded = frame({ zoom: 3.3, width: 390, height: 844, padding: { top: 0, left: 0, right: 0, bottom: 700 } });
    expect(globeCoversViewport(padded)).toBe(false);
    expect(globeCoversViewport(frame({ zoom: 3.3, width: 390, height: 844 }))).toBe(true);
  });
});

describe("RA/Dec conversions", () => {
  it("round-trips and measures angles", () => {
    const { ra, dec } = unitToRaDec(raDecToUnit(101.287, -16.716));
    expect(ra).toBeCloseTo(101.287, 9);
    expect(dec).toBeCloseTo(-16.716, 9);
    expect(angleDeg(raDecToUnit(0, 0), raDecToUnit(90, 0))).toBeCloseTo(90, 9);
    expect(angleDeg(raDecToUnit(0, 90), raDecToUnit(123, -90))).toBeCloseTo(180, 9);
  });
});
