import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoliteFetch } from "../core/fetch";
import { PlaceIndex, resolveObservation } from "../core/resolve";
import { NOW, obs, place, source, tempRoot } from "./helpers";

let root: string;
let store: typeof import("@/lib/data/store");
let engine: typeof import("../core/engine");

const quiet = { info() {}, warn() {} };
const ISO = NOW.toISOString();
const googleSource = source({ id: "google", adapter: "google", trust: 1, tikiSignal: 0.05, schedule: { discovery: "manual" }, config: {} });
const atlasSource = source({ id: "tikiatlas", adapter: "tikiatlas", trust: 0.55, tikiSignal: 0.75, queueNewPlaces: true, schedule: { discovery: "weekly" } });
const mytikiSource = source({ id: "mytiki", adapter: "mytiki", trust: 0.45, tikiSignal: 0.7, queueNewPlaces: true, schedule: { discovery: "daily" }, config: { snapshot: "data/snapshots/mytiki.json", minBars: 1, pageIntervalMs: 0, jitterMs: 0 } });

type Bar = { slug: string; name: string; status?: string; city?: string; state?: string; country?: string; latitude?: number; longitude?: number; googlePlaceId?: string; address?: string };
const bar = (b: Bar) => ({ status: "active", country: "United States", ...b });
/** The atlas adapter refuses a listing under 100 bars, so pad with far-away filler. */
const atlasJs = (bars: Bar[]) => {
  const filler = Array.from({ length: 100 }, (_, i) => bar({ slug: `filler-${i}`, name: `Filler ${i}`, status: "closed", latitude: -40 - i * 0.1, longitude: 170 }));
  return `window.TIKI_BARS_DATA = ${JSON.stringify([...bars.map(bar), ...filler])};`;
};
const fetchOf = (body: string): PoliteFetch =>
  Object.assign(async () => ({ url: "", status: 200, body, fromCache: false, fetchedAt: ISO, headers: {} }), { requests: 1, remaining: 2 }) as unknown as PoliteFetch;

const rejected = place({
  id: "kahuna-tiki-north-hollywood",
  name: "Kahuna Tiki",
  location: { lat: 34.1722, lng: -118.3765, precision: "rooftop" },
  address: { locality: "North Hollywood", region: "California", country: "US" },
  review: { state: "rejected", by: "owner", at: ISO, reason: "permanently closed" },
  tikiConfidence: 0.9,
});

beforeEach(async () => {
  root = tempRoot({});
  process.env.TIKI_ROOT = root;
  store = await import("@/lib/data/store");
  engine = await import("../core/engine");
  store.writeSource(googleSource);
  store.writeSource(atlasSource);
  store.writePlace(rejected);
});
afterEach(() => {
  delete process.env.TIKI_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

const runAtlas = (bars: Bar[]) =>
  engine.runEngine({ now: NOW, log: quiet, skipVerify: true, force: true, sourceFilter: ["tikiatlas"], fetchFactory: () => fetchOf(atlasJs(bars)) });

describe("new directory sources", () => {
  it("holds back a near-match to a rejected place instead of re-adding it", async () => {
    // A different name (0.86 similar) ~200 m away with no Google ID: ordinary matching (150 m, or 0.9 name similarity in town) misses it.
    const result = await runAtlas([{ slug: "big-kahuna-tiki", name: "Big Kahuna Tiki", latitude: 34.174012, longitude: -118.376512, city: "North Hollywood", state: "California" }]);
    expect(result.code).toBe(0);
    expect(result.summary.placesCreated).toBe(0);
    expect(result.report).toContain("Held back by an owner rejection (1)");
    const after = store.readPlaces().find((p) => p.id === rejected.id)!;
    expect(after.review).toMatchObject({ state: "rejected", by: "owner" });
    expect(after.sources.map((s) => s.sourceId)).toContain("tikiatlas");
  });

  it("queues a new place even with coordinates and a Google ID", async () => {
    const result = await runAtlas([{ slug: "mothership", name: "Mothership Tiki Bar", latitude: 32.75, longitude: -117.13, city: "San Diego", state: "California", googlePlaceId: "ChIJ-NEW" }]);
    expect(result.summary.placesCreated).toBe(1);
    const created = store.readPlaces().find((p) => p.externalIds.google === "ChIJ-NEW")!;
    expect(created.location).not.toBeNull();
    expect(created.tikiConfidence).toBeGreaterThanOrEqual(0.8);
    expect(created.review.state).toBe("needs_review");
    expect(created.sources[0]!.url).toBe("https://tikiatlas.com/bar?slug=mothership");
  });

  it("never creates a place from a closed entry", async () => {
    const result = await runAtlas([{ slug: "gone", name: "Gone Tiki", status: "closed", latitude: 40, longitude: -100 }]);
    expect(result.summary.placesCreated).toBe(0);
  });

  it("matches a city-only record by phone", async () => {
    store.writeSource(mytikiSource);
    store.writePlace(
      place({
        id: "hula-hut-austin",
        name: "Chuy's Hula Hut",
        location: { lat: 30.29, lng: -97.78, precision: "rooftop" },
        address: { locality: "West Lake Hills", region: "Texas", country: "US" },
        contact: { phone: "+1 512-476-4852" },
        review: { state: "approved", by: "owner", at: ISO },
      }),
    );
    fs.mkdirSync(`${root}/data/snapshots`, { recursive: true });
    fs.writeFileSync(
      `${root}/data/snapshots/mytiki.json`,
      JSON.stringify([{ slug: "hula-hut-austin", name: "Hula Hut - Austin", type: "Bar & Restaurant", phone: "(512) 476-4852", address: "Austin, Texas, United States", closed: "no", fetched_at: ISO }]),
    );
    // The sitemap lists the bar as last edited before we read it, so no bar page is fetched.
    const sitemap = (url: string) =>
      url.endsWith("sitemap.xml")
        ? `<sitemapindex><sitemap><loc>https://mytiki.life/sitemaps-1-section-tikiBars-1-sitemap-p1.xml</loc></sitemap></sitemapindex>`
        : `<urlset><url><loc>https://mytiki.life/tiki-bars/hula-hut-austin</loc><lastmod>2026-01-01T00:00:00Z</lastmod></url></urlset>`;
    const asked: string[] = [];
    const fetchFactory = () =>
      Object.assign(
        async (url: string) => {
          asked.push(url);
          return { url, status: 200, body: sitemap(url), fromCache: false, fetchedAt: ISO, headers: {} };
        },
        { requests: 2, remaining: 10 },
      ) as unknown as PoliteFetch;
    const result = await engine.runEngine({ now: NOW, log: quiet, skipVerify: true, force: true, sourceFilter: ["mytiki"], fetchFactory });
    expect(asked.some((u) => u.includes("/tiki-bars/"))).toBe(false);
    expect(result.summary.placesCreated).toBe(0);
    const hut = store.readPlaces().find((p) => p.id === "hula-hut-austin")!;
    expect(hut.sources.find((s) => s.sourceId === "mytiki")?.url).toBe("https://mytiki.life/tiki-bars/hula-hut-austin");
  });
});

describe("contact matching", () => {
  const vic = (id: string, locality: string, lat: number) =>
    place({ id, name: "Trader Vic's", location: { lat, lng: 0, precision: "rooftop" }, address: { locality, country: "US" }, contact: { website: "https://tradervics.com/" } });

  it("does not tie a chain's shared domain across cities", () => {
    const index = new PlaceIndex([vic("trader-vics-atlanta", "Atlanta", 33.7), vic("trader-vics-dubai", "Dubai", 25.2)]);
    const o = obs({ sourceId: "mytiki", sourceRef: "tv", name: "Trader Vic's - Emeryville", website: "https://www.tradervics.com/emeryville", address: { locality: "Emeryville", country: "US" } });
    expect(resolveObservation(o, index, new Map()).kind).toBe("create");
    const inAtlanta = obs({ sourceId: "mytiki", sourceRef: "tv2", name: "Trader Vic's Atlanta", website: "https://tradervics.com", address: { locality: "Atlanta", country: "US" } });
    expect(resolveObservation(inAtlanta, index, new Map())).toMatchObject({ kind: "match", place: { id: "trader-vics-atlanta" } });
  });

  it("ignores contact details for records that have coordinates", () => {
    const index = new PlaceIndex([place({ id: "a", name: "Resort Tiki Bar", location: { lat: 24.9, lng: -80.6, precision: "rooftop" }, contact: { phone: "+1 305 664 2321" } })]);
    const o = obs({ sourceId: "osm", sourceRef: "n1", name: "Resort Tiki Bar Two", phone: "+1 305 664 2321", coords: { lat: 25.5, lng: -80.6 }, coordsPrecision: "rooftop" });
    expect(resolveObservation(o, index, new Map()).kind).toBe("create");
  });
});
