import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GoogleClient, GooglePlace } from "../adapters/google";
import type { PoliteFetch } from "../core/fetch";
import { NOW, fixture, source, tempRoot } from "./helpers";

let root: string;
let store: typeof import("@/lib/data/store");
let engine: typeof import("../core/engine");

const googleSource = source({
  id: "google",
  adapter: "google",
  trust: 1,
  tikiSignal: 0.05,
  schedule: { discovery: "manual" },
  config: { monthlyFree: { essentials: 10000, pro: 5000, enterprise: 1000, textSearch: 5000 }, textSearchDailyCap: 20 },
});
const tikiratSource = source({ id: "tikirat", adapter: "tikirat", trust: 0.7, tikiSignal: 0.85, schedule: { discovery: "daily" } });

const smallSitemap = `<?xml version="1.0"?><urlset>
<url><loc>https://tikirat.com/</loc></url>
<url><loc>https://tikirat.com/bars/smuggler-s-cove</loc></url>
<url><loc>https://tikirat.com/bars/the-luau-san-diego</loc></url>
<url><loc>https://tikirat.com/bars/kona-club</loc></url>
<url><loc>https://tikirat.com/drinks/mai-tai</loc></url>
</urlset>`;

const fakeFetch = (body: string): PoliteFetch =>
  Object.assign(async () => ({ url: "", status: 200, body, fromCache: false, fetchedAt: NOW.toISOString(), headers: {} }), { requests: 1, remaining: 99 }) as unknown as PoliteFetch;

const gp = (id: string, name: string, lat: number, lng: number, extra: Partial<GooglePlace> = {}): GooglePlace => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name} St, Somewhere, CA 90000, USA`,
  location: { latitude: lat, longitude: lng },
  addressComponents: [
    { longText: "Somewhere", shortText: "Somewhere", types: ["locality"] },
    { longText: "California", shortText: "CA", types: ["administrative_area_level_1"] },
    { longText: "United States", shortText: "US", types: ["country"] },
  ],
  types: ["bar", "point_of_interest"],
  businessStatus: "OPERATIONAL",
  googleMapsUri: `https://maps.google.com/?cid=${id}`,
  ...extra,
});

function fakeGoogle(calls: string[]): GoogleClient {
  return {
    async textSearch(query) {
      calls.push(`search:${query}`);
      if (query.startsWith("Smuggler's Cove")) return [gp("G-COVE", "Smuggler's Cove", 37.7794, -122.4234)];
      if (query.startsWith("The Luau San Diego")) return [gp("G-LUAU", "The Luau", 32.7685, -117.0442)];
      return [];
    },
    async details(id, tier) {
      calls.push(`details:${id}:${tier}`);
      if (id === "G-COVE") return gp("G-COVE", "Smuggler's Cove", 37.7794, -122.4234, { rating: 4.6, userRatingCount: 3000, regularOpeningHours: { periods: [{ open: { day: 1, hour: 17, minute: 0 }, close: { day: 2, hour: 1, minute: 30 } }], weekdayDescriptions: ["Monday: 5 PM – 1:30 AM"] }, websiteUri: "https://smugglerscovesf.com" });
      if (id === "G-LUAU") return gp("G-LUAU", "The Luau", 32.7685, -117.0442, { businessStatus: "CLOSED_TEMPORARILY" });
      return null;
    },
  };
}

beforeEach(async () => {
  root = tempRoot({});
  process.env.TIKI_ROOT = root;
  store = await import("@/lib/data/store");
  engine = await import("../core/engine");
  store.writeSource(googleSource);
  store.writeSource(tikiratSource);
});
afterEach(() => {
  delete process.env.TIKI_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

const quiet = { info() {}, warn() {} };

describe("runEngine", () => {
  it("discovers, resolves through Google, verifies, and is idempotent offline", async () => {
    const calls: string[] = [];
    const first = await engine.runEngine({
      now: NOW,
      log: quiet,
      fetchFactory: () => fakeFetch(smallSitemap),
      googleClientFactory: () => fakeGoogle(calls),
    });
    expect(first.code).toBe(0);
    expect(first.summary.placesCreated).toBe(3);

    const places = store.readPlaces();
    const cove = places.find((p) => p.id === "smugglers-cove")!;
    expect(cove.externalIds).toEqual({ google: "G-COVE", tikirat: "smuggler-s-cove" });
    expect(cove.review.state).toBe("auto_approved"); // tikirat 0.85 + google id + location
    expect(cove.status.value).toBe("open");
    expect(cove.hours?.periods).toHaveLength(1);
    expect(cove.timezone).toBe("America/Los_Angeles");
    expect(cove.sources.map((s) => s.sourceId).sort()).toEqual(["google", "tikirat"]);
    expect(cove.sources.find((s) => s.sourceId === "tikirat")?.url).toBe("https://tikirat.com/bars/smuggler-s-cove");

    const luau = places.find((p) => p.id === "luau-san-diego")!;
    expect(luau.externalIds.google).toBe("G-LUAU");
    expect(luau.review.state).toBe("needs_review"); // weak (containment) match
    expect(luau.status.value).toBe("temporarily_closed");

    const kona = places.find((p) => p.id === "kona-club")!;
    expect(kona.externalIds.google).toBeUndefined();
    expect(kona.resolution?.result).toBe("none");
    expect(kona.review.state).toBe("needs_review");

    const ledger = store.readLedger();
    expect(ledger.days[NOW.toISOString().slice(0, 10)]).toMatchObject({ textSearch: 3, enterprise: 2 });
    expect(calls.filter((c) => c.startsWith("search:"))).toHaveLength(3);
    expect(store.readObservations("google")).toHaveLength(2);
    expect(store.readSyncState().sources.tikirat?.observationCount).toBe(3);

    // published projection
    const { buildPublicData } = await import("../core/publish");
    const pub = JSON.parse(buildPublicData(places)["places.json"]) as { id: string }[];
    expect(pub.map((p) => p.id)).toEqual(["smugglers-cove"]);

    // idempotent offline replay
    const snapshot = Object.fromEntries(places.map((p) => [p.id, store.serializePlace(p)]));
    const second = await engine.runEngine({ now: new Date("2026-11-02T10:00:00Z"), log: quiet, offline: true, skipVerify: true });
    expect(second.code).toBe(0);
    expect(second.summary.placesUpdated).toBe(0);
    for (const p of store.readPlaces()) expect(store.serializePlace(p)).toBe(snapshot[p.id]);

    // validate passes on what the engine wrote
    const { validateData } = await import("../core/validate");
    expect(validateData().problems).toEqual([]);
  });

  it("replays owner decisions: approve, reject, merge, link", async () => {
    const calls: string[] = [];
    await engine.runEngine({ now: NOW, log: quiet, fetchFactory: () => fakeFetch(smallSitemap), googleClientFactory: () => fakeGoogle(calls) });
    store.writeDecisions([
      { type: "approve", place: "luau-san-diego", at: "2026-11-01T12:00:00.000Z", by: "owner" },
      { type: "reject", place: "kona-club", reason: "closed in 2019", at: "2026-11-01T12:00:00.000Z", by: "owner" },
    ]);
    await engine.runEngine({ now: new Date("2026-11-02T10:00:00Z"), log: quiet, offline: true, skipVerify: true });
    let places = store.readPlaces();
    expect(places.find((p) => p.id === "luau-san-diego")?.review).toMatchObject({ state: "approved", by: "owner" });
    expect(places.find((p) => p.id === "kona-club")?.review).toMatchObject({ state: "rejected", reason: "closed in 2019" });

    // merge kona-club into luau; kona's tikirat ref now belongs to luau and a redirect exists
    store.appendDecision({ type: "merge", from: "kona-club", into: "luau-san-diego", at: "2026-11-01T13:00:00.000Z", by: "owner" });
    const r = await engine.runEngine({ now: new Date("2026-11-03T10:00:00Z"), log: quiet, offline: true, skipVerify: true });
    expect(r.code).toBe(0);
    places = store.readPlaces();
    expect(places.some((p) => p.id === "kona-club")).toBe(false);
    expect(store.readRedirects()).toEqual({ "kona-club": "luau-san-diego" });
    const luau = places.find((p) => p.id === "luau-san-diego")!;
    expect(luau.sources.map((s) => s.sourceRef).sort()).toEqual(["G-LUAU", "kona-club", "the-luau-san-diego"]);
    expect(luau.aliases).toContain("Kona Club");
    // a further offline run does not resurrect kona-club
    await engine.runEngine({ now: new Date("2026-11-04T10:00:00Z"), log: quiet, offline: true, skipVerify: true });
    expect(store.readPlaces().some((p) => p.id === "kona-club")).toBe(false);
    expect(fs.existsSync(path.join(root, "data", "places", "kona-club.json"))).toBe(false);
  });

  it("marks refs missing when a complete listing drops them, and trips the breaker on a collapse", async () => {
    await engine.runEngine({ now: NOW, log: quiet, fetchFactory: () => fakeFetch(smallSitemap), skipVerify: true });
    const dropped = smallSitemap.replace("<url><loc>https://tikirat.com/bars/kona-club</loc></url>", "");
    await engine.runEngine({ now: new Date("2026-11-02T10:00:00Z"), log: quiet, fetchFactory: () => fakeFetch(dropped), skipVerify: true });
    const kona = store.readPlaces().find((p) => p.id === "kona-club")!;
    expect(kona.sources[0]?.missingSince).toBe("2026-11-02T10:00:00.000Z");
    // real sitemap fixture: creating >200 places trips the breaker unless forced
    const big = await engine.runEngine({ now: new Date("2026-11-03T10:00:00Z"), log: quiet, fetchFactory: () => fakeFetch(fixture("tikirat/sitemap.xml")), skipVerify: true });
    expect(big.code).toBe(1);
    expect(big.tripped).toMatch(/new places exceeds/);
    expect(store.readPlaces()).toHaveLength(3);
    const forced = await engine.runEngine({ now: new Date("2026-11-03T10:00:00Z"), log: quiet, fetchFactory: () => fakeFetch(fixture("tikirat/sitemap.xml")), skipVerify: true, force: true });
    expect(forced.code).toBe(0);
    expect(store.readPlaces().length).toBeGreaterThan(300);
  });
});
