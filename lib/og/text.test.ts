import { describe, expect, it } from "vitest";
import { StatusValueSchema } from "@/lib/schema/common";
import { STATUS_TEXT, headlineSize, placeFacts, pluralize, verifiedLine } from "./text";

describe("headlineSize", () => {
  it("steps down as names get longer and never below 52", () => {
    expect(headlineSize("Tonga Hut")).toBe(96);
    expect(headlineSize("Smuggler's Cove Bar")).toBe(80);
    expect(headlineSize("Three Dots and a Dash Chicago")).toBe(64);
    expect(headlineSize("The Boathouse Tiki Bar & Grill - Fort Myers")).toBe(52);
    expect(headlineSize("x".repeat(120))).toBe(52);
    let prev = Infinity;
    for (let n = 1; n <= 80; n++) {
      const s = headlineSize("x".repeat(n));
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("placeFacts", () => {
  it("formats rating, price and year in order", () => {
    expect(placeFacts({ rating: 4.65, ratingCount: 1234, priceLevel: "$$", established: 2009 })).toEqual([
      { kind: "rating", text: "4.7 (1,234)" },
      { kind: "price", text: "$$" },
      { kind: "established", text: "est. 2009" },
    ]);
  });
  it("omits missing fields and the count when zero", () => {
    expect(placeFacts({})).toEqual([]);
    expect(placeFacts({ rating: 4, ratingCount: 0 })).toEqual([{ kind: "rating", text: "4.0" }]);
  });
});

describe("pluralize", () => {
  it("handles one, many and irregular plurals", () => {
    expect(pluralize(1, "tiki bar")).toBe("1 tiki bar");
    expect(pluralize(567, "tiki bar")).toBe("567 tiki bars");
    expect(pluralize(36, "country", "countries")).toBe("36 countries");
    expect(pluralize(1234, "place")).toBe("1,234 places");
  });
});

describe("verifiedLine", () => {
  it("names the month and year, or falls back", () => {
    expect(verifiedLine("2026-10-29T03:00:00.000Z")).toBe("Verified October 2026");
    expect(verifiedLine(undefined)).toBe("Community listed");
    expect(verifiedLine("nope")).toBe("Community listed");
  });
});

describe("STATUS_TEXT", () => {
  it("covers every status value with a label and colour", () => {
    for (const s of StatusValueSchema.options) {
      expect(STATUS_TEXT[s].label).toBeTruthy();
      expect(STATUS_TEXT[s].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
