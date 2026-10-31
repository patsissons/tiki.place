import { describe, expect, it } from "vitest";
import { unitToRaDec } from "./camera";
import { decodeStars, encodeStars, parseDec, parseRa, spectralClass, STAR_HEADER_BYTES, STAR_RECORD_BYTES } from "./stars";

describe("catalogue parsing", () => {
  it("parses Sirius", () => {
    expect(parseRa("06:45:08.92")).toBeCloseTo(101.2872, 3);
    expect(parseDec("-16:42:58.02")).toBeCloseTo(-16.7161, 3);
  });

  it("keeps the sign of small negative declinations", () => {
    expect(parseDec("-00:30:00")).toBe(-0.5);
    expect(parseDec("+00:30:00")).toBe(0.5);
  });

  it("rejects garbage", () => {
    expect(() => parseRa("")).toThrow();
    expect(() => parseDec("12:xx:00")).toThrow();
  });

  it("classifies spectral types", () => {
    expect(spectralClass("A1Vn")).toBe(2);
    expect(spectralClass("K0III")).toBe(5);
    expect(spectralClass("gG8")).toBe(4);
    expect(spectralClass("dM2e")).toBe(6);
    expect(spectralClass("C5II")).toBe(6);
    expect(spectralClass("")).toBe(7);
    expect(spectralClass("pec")).toBe(7);
  });
});

describe("binary codec", () => {
  it("round-trips within the quantisation error", () => {
    const stars = [
      { raDeg: 101.2872, decDeg: -16.7161, mag: -1.46, spectral: "A1Vn" },
      { raDeg: 359.999, decDeg: 89.9, mag: 6.5, spectral: "M3" },
      { raDeg: 0, decDeg: -90, mag: 2.0, spectral: "?" },
    ];
    const buf = encodeStars(stars);
    expect(buf.byteLength).toBe(STAR_HEADER_BYTES + stars.length * STAR_RECORD_BYTES);
    const set = decodeStars(buf);
    expect(set.count).toBe(3);
    stars.forEach((s, i) => {
      const { ra, dec } = unitToRaDec([set.positions[i * 3]!, set.positions[i * 3 + 1]!, set.positions[i * 3 + 2]!]);
      const raDiff = Math.abs(((ra - s.raDeg + 540) % 360) - 180);
      expect(raDiff).toBeLessThan(0.006);
      expect(Math.abs(dec - s.decDeg)).toBeLessThan(0.003);
      expect(set.mags[i]).toBeCloseTo(s.mag, 2);
    });
    expect(Array.from(set.classes)).toEqual([2, 6, 7]);
  });

  it("refuses foreign or truncated buffers", () => {
    expect(() => decodeStars(new ArrayBuffer(4))).toThrow();
    const buf = encodeStars([{ raDeg: 1, decDeg: 1, mag: 1, spectral: "G" }]);
    expect(() => decodeStars(buf.slice(0, buf.byteLength - 1))).toThrow();
    new DataView(buf).setUint8(0, 0);
    expect(() => decodeStars(buf)).toThrow();
  });
});
