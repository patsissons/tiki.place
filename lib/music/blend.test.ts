import { describe, expect, it } from "vitest";
import { BLEND_END_ZOOM, BLEND_START_ZOOM, blendAtZoom, gainsAtZoom } from "./blend";

describe("blendAtZoom", () => {
  it("is all space when zoomed out and all aloha when zoomed in", () => {
    expect(blendAtZoom(1.4)).toBe(0);
    expect(blendAtZoom(BLEND_START_ZOOM)).toBe(0);
    expect(blendAtZoom(BLEND_END_ZOOM)).toBe(1);
    expect(blendAtZoom(13)).toBe(1);
  });

  it("is halfway at the middle of the range and only ever rises", () => {
    expect(blendAtZoom((BLEND_START_ZOOM + BLEND_END_ZOOM) / 2)).toBeCloseTo(0.5);
    let last = -1;
    for (let z = 1; z <= 14; z += 0.25) {
      const b = blendAtZoom(z);
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
  });
});

describe("gainsAtZoom", () => {
  it("plays one loop at full level at each end", () => {
    expect(gainsAtZoom(1.4).space).toBeCloseTo(1);
    expect(gainsAtZoom(1.4).aloha).toBeCloseTo(0);
    expect(gainsAtZoom(13).space).toBeCloseTo(0);
    expect(gainsAtZoom(13).aloha).toBeCloseTo(1);
  });

  it("keeps total power constant through the crossfade", () => {
    for (let z = 1; z <= 14; z += 0.25) {
      const { space, aloha } = gainsAtZoom(z);
      expect(space * space + aloha * aloha).toBeCloseTo(1);
    }
  });
});
