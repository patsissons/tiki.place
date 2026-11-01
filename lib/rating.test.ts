import { describe, expect, it } from "vitest";
import { byRating } from "./rating";

describe("byRating", () => {
  const names = (places: Parameters<typeof byRating>[0][]) => [...places].sort(byRating).map((p) => p.name);

  it("puts the highest rating first", () => {
    expect(names([{ name: "A", rating: 3.9, ratingCount: 900 }, { name: "B", rating: 4.8, ratingCount: 5 }, { name: "C", rating: 4.2, ratingCount: 50 }])).toEqual(["B", "C", "A"]);
  });

  it("breaks rating ties by review count, then name", () => {
    expect(names([{ name: "C", rating: 4.5, ratingCount: 10 }, { name: "B", rating: 4.5, ratingCount: 10 }, { name: "A", rating: 4.5, ratingCount: 2 }, { name: "D", rating: 4.5, ratingCount: 99 }])).toEqual(["D", "B", "C", "A"]);
  });

  it("puts unrated places last, by name", () => {
    expect(names([{ name: "Z" }, { name: "Low", rating: 1, ratingCount: 1 }, { name: "A" }, { name: "High", rating: 5, ratingCount: 1 }])).toEqual(["High", "Low", "A", "Z"]);
  });

  it("never returns NaN for mixed input", () => {
    const rated = { name: "R", rating: 4, ratingCount: 3 };
    expect(byRating(rated, { name: "U" })).toBeLessThan(0);
    expect(byRating({ name: "U" }, rated)).toBeGreaterThan(0);
    expect(byRating({ name: "U" }, { name: "U" })).toBe(0);
  });
});
