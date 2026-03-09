import { describe, expect, it } from "vitest";

import { chooseUniquePlaceMatch, evaluateBadReport } from "@/scripts/automation-lib";

describe("chooseUniquePlaceMatch", () => {
  it("returns a unique exact match", () => {
    const result = chooseUniquePlaceMatch("Smuggler's Cove", "San Francisco", "United States", [
      {
        id: "abc",
        displayName: { text: "Smuggler's Cove" },
        formattedAddress: "650 Gough St, San Francisco, CA, United States",
      },
    ]);

    expect(result.place?.id).toBe("abc");
    expect(result.reason).toBeNull();
  });

  it("flags ambiguous matches", () => {
    const result = chooseUniquePlaceMatch("Trader Vic's", "London", "United Kingdom", [
      {
        id: "one",
        displayName: { text: "Trader Vic's" },
        formattedAddress: "London, United Kingdom",
      },
      {
        id: "two",
        displayName: { text: "Trader Vic's Mayfair" },
        formattedAddress: "London, United Kingdom",
      },
    ]);

    expect(result.place).toBeNull();
    expect(result.reason).toMatch(/Multiple candidate places/);
  });
});

describe("evaluateBadReport", () => {
  it("recommends rejection when tiki and bar signals still exist", () => {
    const result = evaluateBadReport(
      {
        id: "abc",
        displayName: { text: "Tiki Ti" },
        websiteUri: "https://tikiti.com",
        primaryType: "bar",
        types: ["bar"],
      },
      "This does not look like a tiki bar anymore.",
    );

    expect(result.recommendation).toBe("reject");
  });

  it("recommends acceptance when no tiki or bar signals remain", () => {
    const result = evaluateBadReport(
      {
        id: "abc",
        displayName: { text: "Generic Cafe" },
        websiteUri: "https://example.com",
        primaryType: "cafe",
        types: ["cafe"],
      },
      "This is a coffee shop.",
    );

    expect(result.recommendation).toBe("accept");
  });
});
