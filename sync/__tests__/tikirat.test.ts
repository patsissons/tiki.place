import { describe, expect, it } from "vitest";
import { nameFromSlug, parseSitemap, tikiratAdapter } from "../adapters/tikirat";
import type { PoliteFetch } from "../core/fetch";
import { NOW, fixture, source } from "./helpers";

describe("tikirat adapter", () => {
  it("derives readable names from slugs", () => {
    expect(nameFromSlug("the-luau-san-diego")).toBe("The Luau San Diego");
    expect(nameFromSlug("trader-sam-s-enchanted-tiki-bar")).toBe("Trader Sam's Enchanted Tiki Bar");
    expect(nameFromSlug("three-dots-and-a-dash")).toBe("Three Dots & A Dash");
  });

  it("parses the sitemap fixture into directory observations", async () => {
    const xml = fixture("tikirat/sitemap.xml");
    expect(parseSitemap(xml).length).toBeGreaterThan(1000);
    const fetch = Object.assign(async () => ({ url: "", status: 200, body: xml, fromCache: false, fetchedAt: NOW.toISOString(), headers: {} }), { requests: 1, remaining: 1 }) as unknown as PoliteFetch;
    const result = await tikiratAdapter.discover({ source: source({ id: "tikirat" }), fetch, now: NOW, log: { info() {}, warn() {} }, dryRun: true, prior: [] });
    expect(result.complete).toBe(true);
    expect(result.observations.length).toBeGreaterThan(300);
    const luau = result.observations.find((o) => o.sourceRef === "the-luau-san-diego");
    expect(luau).toMatchObject({ name: "The Luau San Diego", url: "https://tikirat.com/bars/the-luau-san-diego", tags: ["tiki-directory"], externalIds: { tikirat: "the-luau-san-diego" }, coords: null });
    // unchanged payloads keep their prior observedAt
    const again = await tikiratAdapter.discover({ source: source({ id: "tikirat" }), fetch, now: new Date("2026-12-01T00:00:00Z"), log: { info() {}, warn() {} }, dryRun: true, prior: result.observations });
    expect(again.observations.find((o) => o.sourceRef === "the-luau-san-diego")?.observedAt).toBe(NOW.toISOString());
  });
});
