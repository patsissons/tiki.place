import { describe, expect, it } from "vitest";
import { googleMapsUrl } from "./utils";

describe("googleMapsUrl", () => {
  const place = { name: "Trader Sam's", lat: 33.8, lng: -117.9 };
  const query = (url: string) => new URL(url).searchParams.get("query");

  it("prefers the Google listing on record", () => {
    const googleMapsUri = "https://maps.google.com/?cid=1";
    expect(googleMapsUrl({ ...place, googleMapsUri, formattedAddress: "1 Main St" })).toBe(googleMapsUri);
  });

  it("searches by name and address without a listing", () => {
    const url = googleMapsUrl({ ...place, formattedAddress: "1 Main St & Co, Anaheim" });
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(query(url)).toBe("Trader Sam's, 1 Main St & Co, Anaheim");
  });

  it("falls back to the locality, then the coordinates", () => {
    expect(query(googleMapsUrl({ ...place, locality: "Anaheim", region: "CA", country: "US" }))).toBe("Trader Sam's, Anaheim, CA, US");
    expect(query(googleMapsUrl(place))).toBe("Trader Sam's, 33.8,-117.9");
  });
});
