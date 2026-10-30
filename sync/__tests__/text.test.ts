import { describe, expect, it } from "vitest";
import { nameSim, normalizeName, looksTiki, streetNumber } from "@/lib/text";
import { placeSlug, slugify } from "@/lib/slug";

describe("normalizeName", () => {
  it("collapses apostrophes, case, diacritics and leading the", () => {
    expect(normalizeName("The Smuggler’s Cove")).toBe("smugglers cove");
    expect(normalizeName("Café Tikí & Co.")).toBe("cafe tiki and co");
  });
});

describe("nameSim", () => {
  it.each([
    ["Smuggler's Cove", "Smugglers Cove", 1],
    ["Smuggler's Cove", "Smuggler's Cove Tiki Bar", 0.85],
    ["The Shameful Tiki Room", "Shameful Tiki Room", 1],
    ["Tonga Hut", "Tonga Hut North Hollywood", 0.6],
  ])("%s vs %s >= %d", (a, b, min) => {
    expect(nameSim(a, b)).toBeGreaterThanOrEqual(min);
  });
  it("keeps distinct venues apart", () => {
    expect(nameSim("Trader Vic's", "Trader Vic's Mayfair")).toBeLessThan(0.85);
    expect(nameSim("Lost Lake", "Three Dots and a Dash")).toBeLessThan(0.3);
    expect(nameSim("Tiki Bar", "Tiki Lounge")).toBeLessThan(0.85);
  });
});

describe("slugify / placeSlug", () => {
  it("builds stable kebab slugs", () => {
    expect(slugify("The Shameful Tiki Room")).toBe("shameful-tiki-room");
    expect(slugify("Beachbum Berry's Latitude 29")).toBe("beachbum-berrys-latitude-29");
    expect(placeSlug("Smuggler's Cove", "San Francisco")).toBe("smugglers-cove-san-francisco");
    expect(placeSlug("Tiki Bar San Diego", "San Diego")).toBe("tiki-bar-san-diego");
  });
});

describe("misc", () => {
  it("detects tiki keywords and street numbers", () => {
    expect(looksTiki("Hale Pele")).toBe(false);
    expect(looksTiki("Trader Sam's Grog Grotto")).toBe(true);
    expect(streetNumber("650 Gough St")).toBe("650");
    expect(streetNumber("Unit 4, 12A High Street")).toBe("4");
  });
});
