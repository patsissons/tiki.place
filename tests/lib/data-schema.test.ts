import { describe, expect, it } from "vitest";

import { parseTikiDataset } from "@/lib/data-schema";

describe("parseTikiDataset", () => {
  it("rejects duplicate place ids", () => {
    const yaml = `
bars:
  - placeId: abc
    slug: one
    name: Bar One
    coordinates:
      lat: 1
      lng: 2
    formattedAddress: One Street
    address:
      countryCode: US
      country: United States
      region: California
      locality: Oakland
      postalCode: "94607"
      streetAddress: 1 One St
    googleMapsUrl: https://maps.google.com/?cid=1
    rating: 4.5
    userRatingCount: 10
    weekdayText: []
    openingPeriods: []
    timeZone: America/Los_Angeles
    businessStatus: OPERATIONAL
    lastSyncedAt: "2026-03-09T00:00:00.000Z"
  - placeId: abc
    slug: two
    name: Bar Two
    coordinates:
      lat: 2
      lng: 3
    formattedAddress: Two Street
    address:
      countryCode: US
      country: United States
      region: California
      locality: Oakland
      postalCode: "94607"
      streetAddress: 2 Two St
    googleMapsUrl: https://maps.google.com/?cid=2
    rating: 4.1
    userRatingCount: 12
    weekdayText: []
    openingPeriods: []
    timeZone: America/Los_Angeles
    businessStatus: OPERATIONAL
    lastSyncedAt: "2026-03-09T00:00:00.000Z"
`;

    expect(() => parseTikiDataset(yaml)).toThrow(/Duplicate placeId/);
  });

  it("requires expected fields", () => {
    expect(() => parseTikiDataset("bars:\n  - placeId: missing-fields\n")).toThrow();
  });
});
