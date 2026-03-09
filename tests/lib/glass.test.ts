import { describe, expect, it } from "vitest";

import { getGlassIntensity, getGlassSurfaceStyle } from "@/lib/glass";

describe("getGlassIntensity", () => {
  it("keeps the extra whitening off until country-scale zoom", () => {
    expect(getGlassIntensity(4.2)).toBe(0);
    expect(getGlassIntensity(5.5)).toBe(0);
  });

  it("ramps up continuously and exponentially while zooming out", () => {
    const country = getGlassIntensity(4);
    const region = getGlassIntensity(3);
    const globe = getGlassIntensity(2);
    const space = getGlassIntensity(1.4);

    expect(country).toBeGreaterThan(0);
    expect(region).toBeGreaterThan(country);
    expect(globe).toBeGreaterThan(region);
    expect(space).toBe(1);
    expect(space - globe).toBeGreaterThan(region - country);
  });
});

describe("getGlassSurfaceStyle", () => {
  it("maps the zoom curve into stronger glass opacities", () => {
    const country = getGlassSurfaceStyle(4.2);
    const space = getGlassSurfaceStyle(1.4);

    expect(country["--glass-bg-opacity"]).toBe("0.220");
    expect(space["--glass-bg-opacity"]).toBe("0.780");
    expect(space["--glass-panel-bg-opacity"]).toBe("0.680");
  });
});
