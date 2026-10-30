import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nameFromSlug, parseBarPage, parseSitemap, tikiratAdapter } from "../adapters/tikirat";
import type { PoliteFetch } from "../core/fetch";
import { NOW, fixture, source, tempRoot } from "./helpers";

const FETCHED = "2026-10-30T20:00:00.000Z";
const barPage = {
  text: "ALL BARS\nTIKI ADJACENT\nOPEN — VERIFY FIT\nEst. ~1964\nHAWAIIAN ROOM\n\nBellflower, CA, United States\n\nTHE STORY\n\nA long editorial story.\n\nFIND IT\nVISIT\nADDRESS\n9875 Alondra Blvd, Bellflower CA 90706, USA\nPHONE\n562-866-9252\nWEBSITE\n—\nTHE DETAILS\nESTABLISHED\n~1964\nLAST VERIFIED\n2026-06-07\nCREW CHAT",
  ldJson: [
    JSON.stringify({
      "@type": "BarOrPub",
      name: "Hawaiian Room",
      description: "A long editorial story.",
      url: "https://—",
      telephone: "562-866-9252",
      address: { streetAddress: "9875 Alondra Blvd, Bellflower CA 90706, USA", addressLocality: "Bellflower", addressRegion: "CA", addressCountry: "United States" },
      geo: { latitude: 33.888, longitude: -118.125 },
    }),
  ],
};

describe("tikirat adapter", () => {
  it("parses facts from a rendered bar page and never the story", () => {
    const row = parseBarPage("hawaiian-room", barPage, FETCHED);
    expect(row).toEqual({
      slug: "hawaiian-room",
      name: "Hawaiian Room",
      address: "9875 Alondra Blvd",
      formatted_address: "9875 Alondra Blvd, Bellflower CA 90706, USA",
      city: "Bellflower",
      region: "CA",
      country: "United States",
      postal_code: "90706",
      lat: 33.888,
      lng: -118.125,
      phone: "562-866-9252",
      website: undefined,
      established: 1964,
      status: "OPEN — VERIFY FIT",
      kind: "tiki-adjacent",
      last_verified: "2026-06-07",
      fetched_at: FETCHED,
    });
    expect(JSON.stringify(row)).not.toContain("editorial");
    expect(parseBarPage("x", { text: "", ldJson: ["not json"] }, FETCHED)).toBeNull();
  });

  it("hydrates observations from the committed snapshot and keeps the attribution link", async () => {
    const root = tempRoot({ "data/snapshots/tikirat.json": JSON.stringify([parseBarPage("hawaiian-room", barPage, FETCHED)]) });
    process.env.TIKI_ROOT = root;
    const xml = `<urlset><url><loc>https://tikirat.com/bars/hawaiian-room</loc></url><url><loc>https://tikirat.com/bars/kona-club</loc></url></urlset>`;
    const fetch = Object.assign(async () => ({ url: "", status: 200, body: xml, fromCache: false, fetchedAt: NOW.toISOString(), headers: {} }), { requests: 1, remaining: 1 }) as unknown as PoliteFetch;
    try {
      const { observations } = await tikiratAdapter.discover({ source: source({ id: "tikirat", config: { snapshot: "data/snapshots/tikirat.json" } }), fetch, now: NOW, log: { info() {}, warn() {} }, dryRun: true, prior: [] });
      const room = observations.find((o) => o.sourceRef === "hawaiian-room")!;
      expect(room).toMatchObject({
        name: "Hawaiian Room",
        url: "https://tikirat.com/bars/hawaiian-room",
        coords: { lat: 33.888, lng: -118.125 },
        address: { street: "9875 Alondra Blvd", locality: "Bellflower", region: "CA", postalCode: "90706", country: "US" },
        established: 1964,
        sourceVerifiedAt: "2026-06-07",
        statusHint: "open",
        categories: ["tiki-adjacent"],
        observedAt: FETCHED,
      });
      expect(observations.find((o) => o.sourceRef === "kona-club")?.coords).toBeNull();
    } finally {
      delete process.env.TIKI_ROOT;
      fs.rmSync(path.resolve(root), { recursive: true, force: true });
    }
  });

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
