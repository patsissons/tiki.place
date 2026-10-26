import { describe, expect, it } from "vitest";
import { PlaceIndex, resolveObservation } from "../core/resolve";
import { obs, place } from "./helpers";

const sf = { lat: 37.7794028, lng: -122.4233722 };
const cove = place({
  id: "smugglers-cove-san-francisco",
  name: "Smuggler's Cove",
  location: { ...sf, precision: "rooftop" },
  address: { street: "650 Gough St", locality: "San Francisco", region: "California", country: "US" },
  externalIds: { google: "ChIJZYKHDZiAhYARXV0sNJgKAi8" },
  sources: [{ sourceId: "google", sourceRef: "ChIJZYKHDZiAhYARXV0sNJgKAi8", firstSeenAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z" }],
});

describe("resolveObservation", () => {
  const index = new PlaceIndex([cove]);
  const links = new Map<string, string>();

  it("matches by source ref, then external id", () => {
    expect(resolveObservation(obs({ sourceId: "google", sourceRef: "ChIJZYKHDZiAhYARXV0sNJgKAi8", name: "whatever" }), index, links)).toMatchObject({ kind: "match", via: "source-ref" });
    expect(resolveObservation(obs({ sourceId: "osm", sourceRef: "node/1", name: "x", externalIds: { google: "ChIJZYKHDZiAhYARXV0sNJgKAi8" } }), index, links)).toMatchObject({ kind: "match", via: "external-id" });
  });

  it("matches nearby places with similar names", () => {
    const near = obs({ sourceId: "osm", sourceRef: "node/2", name: "Smugglers Cove", coords: { lat: sf.lat + 0.0005, lng: sf.lng }, coordsPrecision: "rooftop" });
    expect(resolveObservation(near, index, links)).toMatchObject({ kind: "match", via: "geo+name" });
    const farSameName = obs({ sourceId: "osm", sourceRef: "node/3", name: "Smugglers Cove", coords: { lat: sf.lat + 0.01, lng: sf.lng }, coordsPrecision: "rooftop" });
    expect(resolveObservation(farSameName, index, links)).toEqual({ kind: "create" });
    const nearDifferent = obs({ sourceId: "osm", sourceRef: "node/4", name: "Zombie Village", coords: { lat: sf.lat + 0.0002, lng: sf.lng }, coordsPrecision: "rooftop" });
    expect(resolveObservation(nearDifferent, index, links)).toEqual({ kind: "create" });
  });

  it("accepts a weaker name when the street number matches within 150 m", () => {
    const o = obs({ sourceId: "osm", sourceRef: "node/5", name: "Smuggler's Cove Bar", address: { street: "650 Gough Street" }, coords: { lat: sf.lat + 0.001, lng: sf.lng }, coordsPrecision: "rooftop" });
    expect(resolveObservation(o, index, links)).toMatchObject({ kind: "match" });
  });

  it("matches by locality when there are no coords", () => {
    const o = obs({ sourceId: "tikiwanderlust", sourceRef: "ca/smugglers-cove", name: "Smugglers Cove", address: { locality: "San Francisco", region: "California", country: "US" } });
    expect(resolveObservation(o, index, links)).toMatchObject({ kind: "match", via: "locality+name" });
  });

  it("honours link decisions first", () => {
    const linked = new Map([["tikirat:some-slug", "smugglers-cove-san-francisco"]]);
    expect(resolveObservation(obs({ sourceId: "tikirat", sourceRef: "some-slug", name: "Totally Different" }), index, linked)).toMatchObject({ kind: "match", via: "link" });
  });
});
