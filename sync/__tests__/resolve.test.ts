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

  it("treats state codes, state names and a missing country as one locality", () => {
    const places = new PlaceIndex([
      place({ id: "electric-cure", name: "The Electric Cure", address: { locality: "Edgewater", region: "CO", country: "US" } }),
      place({ id: "undertow", name: "Undertow", address: { locality: "Phoenix", region: "AZ" } }),
      place({ id: "vancouver-bar", name: "Shameful", address: { locality: "Vancouver", region: "WA", country: "AU" } }),
    ]);
    const at = (name: string, locality: string, region: string) => obs({ sourceId: "tikiwanderlust", sourceRef: name, name, address: { locality, region, country: "US" } });
    expect(resolveObservation(at("the Electric Cure", "Edgewater", "Colorado"), places, links)).toMatchObject({ kind: "match", place: { id: "electric-cure" } });
    expect(resolveObservation(at("Undertow", "Phoenix", "Arizona"), places, links)).toMatchObject({ kind: "match", place: { id: "undertow" } });
    expect(resolveObservation(at("Shameful", "Vancouver", "Washington"), places, links)).toEqual({ kind: "create" });
  });

  it("ignores a trailing city in a name, but only within that city", () => {
    const places = new PlaceIndex([place({ id: "strong-water", name: "Strong Water Anaheim", address: { locality: "Anaheim", region: "California", country: "US" } })]);
    const at = (locality: string) => obs({ sourceId: "tikiwanderlust", sourceRef: locality, name: "Strong Water", address: { locality, region: "California", country: "US" } });
    expect(resolveObservation(at("Anaheim"), places, links)).toMatchObject({ kind: "match", place: { id: "strong-water" } });
    expect(resolveObservation(at("Tustin"), places, links)).toEqual({ kind: "create" });
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

describe("PlaceIndex.refresh", () => {
  it("replaces the stale object for the same id instead of keeping both", () => {
    const index = new PlaceIndex([cove]);
    const updated = { ...structuredClone(cove), name: "Smuggler's Cove SF" };
    index.refresh(updated);
    const near = index.near(sf, 50);
    expect(near).toHaveLength(1);
    expect(near[0]?.place.name).toBe("Smuggler's Cove SF");
    expect(index.bySource("google", "ChIJZYKHDZiAhYARXV0sNJgKAi8")?.name).toBe("Smuggler's Cove SF");
  });
});
