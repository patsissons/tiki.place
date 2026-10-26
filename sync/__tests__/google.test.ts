import { describe, expect, it } from "vitest";
import { fieldMask, googleToObservation, pickCandidate, type GooglePlace } from "../adapters/google";
import { place } from "./helpers";

const cove: GooglePlace = {
  id: "ChIJ1",
  displayName: { text: "Smuggler's Cove" },
  formattedAddress: "650 Gough St, San Francisco, CA 94102, USA",
  location: { latitude: 37.7794028, longitude: -122.4233722 },
  addressComponents: [
    { longText: "650", shortText: "650", types: ["street_number"] },
    { longText: "Gough Street", shortText: "Gough St", types: ["route"] },
    { longText: "San Francisco", shortText: "SF", types: ["locality", "political"] },
    { longText: "California", shortText: "CA", types: ["administrative_area_level_1", "political"] },
    { longText: "United States", shortText: "US", types: ["country", "political"] },
    { longText: "94102", shortText: "94102", types: ["postal_code"] },
  ],
  types: ["bar", "point_of_interest", "establishment"],
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=1",
  regularOpeningHours: { periods: [{ open: { day: 1, hour: 17, minute: 0 }, close: { day: 2, hour: 1, minute: 30 } }], weekdayDescriptions: ["Monday: 5:00 PM – 1:30 AM"] },
  websiteUri: "smugglerscovesf.com",
  internationalPhoneNumber: "+1 415-869-1900",
  rating: 4.6,
  userRatingCount: 3238,
  priceLevel: "PRICE_LEVEL_MODERATE",
};

describe("google mapping", () => {
  it("builds field masks per tier", () => {
    expect(fieldMask("pro")).not.toContain("rating");
    expect(fieldMask("enterprise")).toContain("regularOpeningHours");
    expect(fieldMask("pro", "places.")).toContain("places.businessStatus");
  });
  it("maps a place to an observation", () => {
    const o = googleToObservation(cove, "google", "2026-11-01T00:00:00.000Z");
    expect(o).toMatchObject({
      sourceRef: "ChIJ1",
      name: "Smuggler's Cove",
      address: { street: "650 Gough Street", locality: "San Francisco", region: "California", postalCode: "94102", country: "US" },
      coordsPrecision: "rooftop",
      statusHint: "open",
      website: "https://smugglerscovesf.com/",
      priceLevel: "$$",
      tags: ["bar-category"],
      externalIds: { google: "ChIJ1" },
    });
    expect(o.hours?.periods[0]).toEqual({ open: { day: 1, time: "1700" }, close: { day: 2, time: "0130" } });
  });
});

describe("pickCandidate", () => {
  const far: GooglePlace = { ...cove, id: "ChIJ2", displayName: { text: "Smuggler's Cove" }, location: { latitude: 37.9, longitude: -122.4 } };
  it("accepts a close, similar candidate and rejects far ones", () => {
    const p = place({ id: "x", name: "Smugglers Cove", location: { lat: 37.7794, lng: -122.4234, precision: "rooftop" } });
    expect(pickCandidate(p, [far, cove])).toMatchObject({ outcome: "accept", place: { id: "ChIJ1" }, weak: false });
    expect(pickCandidate(p, [far])).toMatchObject({ outcome: "none" });
  });
  it("uses containment for slug-derived names without coordinates, flagged weak", () => {
    const p = place({ id: "luau-san-diego", name: "The Luau San Diego" });
    const luau: GooglePlace = { ...cove, id: "ChIJ3", displayName: { text: "The Luau" }, types: ["bar"] };
    expect(pickCandidate(p, [luau])).toMatchObject({ outcome: "accept", weak: true });
    const carwash: GooglePlace = { ...luau, id: "ChIJ4", displayName: { text: "Luau Car Wash" }, types: ["car_wash"] };
    expect(pickCandidate(p, [carwash])).toMatchObject({ outcome: "none" });
  });
  it("reports ambiguity when two candidates tie", () => {
    const p = place({ id: "x", name: "Tiki Ti" });
    const a: GooglePlace = { ...cove, id: "A", displayName: { text: "Tiki Ti" }, types: ["bar"] };
    const b: GooglePlace = { ...cove, id: "B", displayName: { text: "Tiki-Ti" }, types: ["bar"] };
    expect(pickCandidate(p, [a, b]).outcome).toBe("ambiguous");
  });
});
