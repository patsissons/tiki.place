import { describe, expect, it } from "vitest";
import { latestPerKey, mergePlace, newPlaceSkeleton } from "../core/merge";
import { NOW, obs, source } from "./helpers";

const sources = new Map([
  ["google", source({ id: "google", adapter: "google", trust: 1 })],
  ["tikirat", source({ id: "tikirat", trust: 0.7 })],
  ["osm", source({ id: "osm", adapter: "osm-overpass", trust: 0.5 })],
]);
const ctx = { sources, now: NOW };

const tikirat = obs({
  sourceId: "tikirat",
  sourceRef: "smugglers-cove",
  url: "https://tikirat.com/bars/smugglers-cove",
  name: "Smugglers Cove",
  altNames: ["Smuggler's Cove Tiki Bar"],
  website: "https://smugglerscovesf.com/",
  established: 2009,
  tags: ["tiki-directory"],
  observedAt: "2026-10-01T00:00:00.000Z",
});
const google = obs({
  sourceId: "google",
  sourceRef: "ChIJ1",
  name: "Smuggler's Cove",
  address: { street: "650 Gough St", locality: "San Francisco", region: "California", postalCode: "94102", country: "US" },
  formattedAddress: "650 Gough St, San Francisco, CA 94102, USA",
  coords: { lat: 37.7794, lng: -122.4234 },
  coordsPrecision: "rooftop",
  website: "http://www.smugglerscovesf.com/",
  statusHint: "open",
  externalIds: { google: "ChIJ1" },
  hours: { periods: [{ open: { day: 1, time: "1700" }, close: { day: 2, time: "0130" } }], weekdayText: ["Monday: 5 PM - 1:30 AM"] },
  rating: { value: 4.6, count: 3000 },
  observedAt: "2026-10-15T00:00:00.000Z",
});

describe("mergePlace", () => {
  it("applies precedence and records provenance", () => {
    const merged = mergePlace(newPlaceSkeleton("smugglers-cove-san-francisco", NOW), [tikirat, google], ctx);
    expect(merged.name).toBe("Smuggler's Cove");
    expect(merged.aliases).toEqual(["Smuggler's Cove Tiki Bar"]); // same normalized name is not an alias
    expect(merged.contact.website).toBe("http://www.smugglerscovesf.com/");
    expect(merged.provenance["contact.website"]?.sourceId).toBe("google");
    expect(merged.established).toBe(2009);
    expect(merged.provenance.established?.sourceId).toBe("tikirat");
    expect(merged.timezone).toBe("America/Los_Angeles");
    expect(merged.location).toEqual({ lat: 37.7794, lng: -122.4234, precision: "rooftop" });
    expect(merged.hours?.periods).toHaveLength(1);
    expect(merged.lastVerifiedAt).toBe("2026-10-15T00:00:00.000Z");
    expect(merged.sources.map((s) => `${s.sourceId}:${s.sourceRef}`)).toEqual(["google:ChIJ1", "tikirat:smugglers-cove"]);
    expect(merged.firstSeenAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const once = mergePlace(newPlaceSkeleton("x", NOW), [tikirat, google], ctx);
    const twice = mergePlace(once, [tikirat, google], ctx);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("never downgrades location precision and respects pins", () => {
    const base = mergePlace(newPlaceSkeleton("x", NOW), [google], ctx);
    const approx = obs({ ...tikirat, coords: { lat: 1, lng: 1 }, coordsPrecision: "approximate" });
    const merged = mergePlace(base, [google, approx], ctx);
    expect(merged.location?.lat).toBe(37.7794);
    const pinned = { ...base, name: "Pinned Name", provenance: { ...base.provenance, name: { sourceId: "owner", observedAt: "2026-10-20T00:00:00.000Z" } } };
    expect(mergePlace(pinned, [google], ctx).name).toBe("Pinned Name");
  });

  it("latestPerKey keeps the newest observation per source ref", () => {
    const older = { ...google, observedAt: "2026-01-01T00:00:00.000Z", rating: { value: 4, count: 1 } };
    const latest = latestPerKey([older, google]);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.rating?.count).toBe(3000);
  });
});
