import { describe, expect, it } from "vitest";

import { filterBars } from "@/lib/filters";
import type { TikiBar } from "@/lib/data-schema";

const sampleBars: TikiBar[] = [
  {
    placeId: "one",
    slug: "night-owl",
    name: "Night Owl Tiki",
    coordinates: { lat: 0, lng: 0 },
    formattedAddress: "1 Night St",
    address: {
      countryCode: "US",
      country: "United States",
      region: "California",
      locality: "San Diego",
      postalCode: "92101",
      streetAddress: "1 Night St",
    },
    googleMapsUrl: "https://maps.google.com/?cid=1",
    rating: 4.7,
    userRatingCount: 220,
    weekdayText: [],
    openingPeriods: [
      {
        open: { day: 5, time: "1700" },
        close: { day: 6, time: "0130" },
      },
    ],
    timeZone: "America/Los_Angeles",
    businessStatus: "OPERATIONAL",
    lastSyncedAt: "2026-03-09T00:00:00.000Z",
  },
  {
    placeId: "two",
    slug: "daylight",
    name: "Daylight Tiki",
    coordinates: { lat: 1, lng: 1 },
    formattedAddress: "2 Day St",
    address: {
      countryCode: "US",
      country: "United States",
      region: "California",
      locality: "San Diego",
      postalCode: "92101",
      streetAddress: "2 Day St",
    },
    googleMapsUrl: "https://maps.google.com/?cid=2",
    rating: 4.1,
    userRatingCount: 98,
    weekdayText: [],
    openingPeriods: [
      {
        open: { day: 5, time: "1200" },
        close: { day: 5, time: "1600" },
      },
    ],
    timeZone: "America/Los_Angeles",
    businessStatus: "OPERATIONAL",
    lastSyncedAt: "2026-03-09T00:00:00.000Z",
  },
];

describe("filterBars", () => {
  it("filters with partial title matching", () => {
    const result = filterBars(sampleBars, {
      search: "owl",
      minimumRating: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.placeId).toBe("one");
  });

  it("filters on minimum rating", () => {
    const result = filterBars(sampleBars, {
      search: "",
      minimumRating: 4.5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.placeId).toBe("one");
  });

  it("requires venues to stay open for the entire selected range", () => {
    const result = filterBars(sampleBars, {
      search: "",
      minimumRating: 0,
      startLocal: "2026-03-13T18:00",
      endLocal: "2026-03-13T23:30",
    });

    expect(result.map((bar) => bar.placeId)).toEqual(["one"]);
  });

  it("supports overnight hours that cross midnight", () => {
    const result = filterBars(sampleBars, {
      search: "",
      minimumRating: 0,
      startLocal: "2026-03-13T23:45",
      endLocal: "2026-03-14T01:00",
    });

    expect(result.map((bar) => bar.placeId)).toEqual(["one"]);
  });
});
