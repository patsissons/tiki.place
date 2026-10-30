import { describe, expect, it } from "vitest";
import { elementToObservation, osmOverpassAdapter } from "../adapters/osm-overpass";
import type { PoliteFetch } from "../core/fetch";
import { NOW, fixture, source } from "./helpers";

describe("osm overpass adapter", () => {
  it("maps elements with tags into observations", () => {
    const o = elementToObservation(
      {
        type: "node",
        id: 568040898,
        lat: 52.0767,
        lon: 4.3012,
        tags: { name: "VaVoom Tiki Room", amenity: "bar", theme: "tiki", "addr:city": "'s-Gravenhage", "addr:country": "nl", website: "vavoomtikiroom.nl", opening_hours: "We,Su 16:00-01:00" },
      },
      "osm",
      NOW.toISOString(),
    );
    expect(o).toMatchObject({
      sourceRef: "node/568040898",
      url: "https://www.openstreetmap.org/node/568040898",
      name: "VaVoom Tiki Room",
      address: { locality: "'s-Gravenhage", country: "NL" },
      coordsPrecision: "rooftop",
      website: "https://vavoomtikiroom.nl/",
      tags: ["tiki-category", "tiki-name", "bar-category"],
      externalIds: { osm: "node/568040898" },
    });
    expect(elementToObservation({ type: "way", id: 1, center: { lat: 1, lon: 2 }, tags: { amenity: "bar" } }, "osm", NOW.toISOString())).toBeNull();
  });

  it("parses the live fixture and falls back across mirrors", async () => {
    const body = fixture("osm/overpass.json");
    let calls = 0;
    const fetch = Object.assign(
      async (url: string) => {
        calls++;
        if (url.startsWith("https://overpass-api.de")) return { url, status: 504, body: "<html>busy</html>", fromCache: false, fetchedAt: NOW.toISOString(), headers: {} };
        return { url, status: 200, body, fromCache: false, fetchedAt: NOW.toISOString(), headers: {} };
      },
      { requests: 0, remaining: 10 },
    ) as unknown as PoliteFetch;
    const result = await osmOverpassAdapter.discover({ source: source({ id: "osm", adapter: "osm-overpass" }), fetch, now: NOW, log: { info() {}, warn() {} }, dryRun: true, prior: [] });
    expect(calls).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.observations.length).toBeGreaterThan(500);
    expect(result.observations.every((o) => o.coords !== null)).toBe(true);
    expect(result.observations.filter((o) => o.tags.includes("tiki-category")).length).toBeGreaterThan(10);
  });
});
