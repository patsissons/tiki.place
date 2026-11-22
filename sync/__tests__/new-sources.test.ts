import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countryToIso } from "@/lib/country";
import { ChallengeDetected, SourceThrottled, createPoliteFetch, parseRobots, robotsAllows } from "../core/fetch";
import { googleMyMapsAdapter, parseKml, placemarkRef } from "../adapters/google-mymaps";
import { barsToRead, displayName, mytikiAdapter, parseAddress, parseBarPage, parseBarSitemapEntries, parseBarSitemaps, parseBarSlugs, readSnapshot, rowToObservation, vouches, type MytikiRow } from "../adapters/mytiki";
import { barToObservation, parseAtlasData } from "../adapters/tikiatlas";
import type { PoliteFetch } from "../core/fetch";
import { mergePlace, newPlaceSkeleton } from "../core/merge";
import { NOW, fixture, source, tempRoot } from "./helpers";

const log = { info() {}, warn() {} };
const AT = "2026-11-21T00:00:00.000Z";

describe("countryToIso", () => {
  it.each([
    ["United States", "US"],
    ["US", "US"],
    ["España", "ES"],
    ["日本", "JP"],
    ["Česko", "CZ"],
    ["Deutschland", "DE"],
    ["Schweiz/Suisse/Svizzera/Svizra", "CH"],
    ["België / Belgique / Belgien", "BE"],
    ["Ελλάς", "GR"],
    ["臺灣", "TW"],
    ["ประเทศไทย", "TH"],
    ["United Kingdom", "GB"],
    ["Belau", "PW"],
  ])("%s -> %s", (name, code) => expect(countryToIso(name)).toBe(code));

  it("returns undefined for unknown names", () => expect(countryToIso("Atlantis")).toBeUndefined());
});

describe("tikiatlas", () => {
  const bars = parseAtlasData(fixture("tikiatlas/data.js"));

  it("parses data.js as data", () => {
    expect(bars.map((b) => b.slug)).toEqual(["the-mai-kai", "10th-island-tiki-bar-and-grill", "don-the-beachcomber-hollywood", "atlantis"]);
    expect(() => parseAtlasData("alert(1)")).toThrow();
  });

  it("keeps facts and drops the atlas's editorial text", () => {
    const o = barToObservation("tikiatlas", "https://tikiatlas.com/bar?slug=", bars[0]!, AT);
    expect(o).toMatchObject({
      sourceRef: "the-mai-kai",
      url: "https://tikiatlas.com/bar?slug=the-mai-kai",
      name: "The Mai-Kai",
      address: { street: "3599 N Federal Hwy", locality: "Fort Lauderdale", region: "FL", country: "US" },
      coords: { lat: 26.1224, lng: -80.1373 },
      coordsPrecision: "locality",
      website: "https://maikai.com/",
      statusHint: null,
      tags: ["tiki-directory"],
      externalIds: {},
      established: 1956,
    });
    const text = JSON.stringify(o);
    for (const editorial of ["cathedral", "Thornton", "Black Magic", "commons"]) expect(text).not.toContain(editorial);
  });

  it("carries the Google ID and parses local-language addresses", () => {
    const cin = barToObservation("tikiatlas", "https://tikiatlas.com/bar?slug=", bars[1]!, AT);
    expect(cin).toMatchObject({
      externalIds: { google: "ChIJlynNSbezQYgRUF-h0gaVTRg" },
      coordsPrecision: "rooftop",
      address: { street: "1386 Yukon Street", locality: "Cincinnati", region: "Ohio", postalCode: "45202", country: "US" },
    });
    const atlantis = barToObservation("tikiatlas", "https://tikiatlas.com/bar?slug=", bars[3]!, AT);
    expect(atlantis.address.country).toBe("ES");
  });

  it("never vouches for closed bars and gives no status hint", () => {
    const closed = barToObservation("tikiatlas", "https://tikiatlas.com/bar?slug=", bars[2]!, AT);
    expect(closed.tags).toEqual([]);
    expect(closed.statusHint).toBeNull();
    expect(closed.website).toBeUndefined();
  });
});

describe("mytiki", () => {
  it("reads facts from bar pages, ignoring the site's dialogs", () => {
    expect(parseBarPage("hula-hut-austin", fixture("mytiki/hula-hut-austin.html"), AT)).toEqual({
      slug: "hula-hut-austin",
      id: 476,
      name: "Hula Hut - Austin",
      type: "Bar & Restaurant",
      phone: "+1 512-476-4852",
      address: "Austin, Texas, United States",
      closed: "no",
      website: "http://www.hulahut.com/",
      fetched_at: AT,
    });
    expect(parseBarPage("ben-lenhoffs-bali-bali-chicago", fixture("mytiki/ben-lenhoffs-bali-bali-chicago.html"), AT)).toEqual({
      slug: "ben-lenhoffs-bali-bali-chicago",
      id: 1192187,
      name: "Ben Lenhoff's Bali Bali - Chicago",
      type: "Bar",
      address: "Chicago, Illinois, United States",
      closed: "permanently",
      fetched_at: AT, // the tikicentral.com reference link is not the bar's website
    });
    const motel = parseBarPage("tropics-motel-1", fixture("mytiki/tropics-motel-1.html"), AT)!;
    expect(motel).toMatchObject({ type: "Hotel/Motel", closed: "permanently" });
    expect(parseBarPage("x", "<html><h1>Help keep mytiki.life growing</h1></html>", AT)).toBeNull();
  });

  it("stores no descriptions", () => {
    const row = parseBarPage("hula-hut-austin", fixture("mytiki/hula-hut-austin.html"), AT)!;
    expect(JSON.stringify(row)).not.toMatch(/Opened in 1993|fish sculpture/);
  });

  it("only open bar-like entries vouch", () => {
    const base = { slug: "x", name: "X", fetched_at: AT };
    expect(vouches({ ...base, type: "Bar & Restaurant", closed: "no" })).toBe(true);
    expect(vouches({ ...base, type: "Bar", closed: "permanently" })).toBe(false);
    expect(vouches({ ...base, type: "Hotel/Motel", closed: "no" })).toBe(false);
    expect(vouches({ ...base, type: "Bar" })).toBe(false);
  });

  it("parses addresses and trims a trailing city from names", () => {
    expect(parseAddress("Austin, Texas, United States")).toEqual({ locality: "Austin", region: "Texas", country: "US" });
    expect(parseAddress("Edinburgh, United Kingdom")).toEqual({ locality: "Edinburgh", country: "GB" });
    expect(parseAddress("12 Main St, Austin, Texas, United States")).toEqual({ street: "12 Main St", locality: "Austin", region: "Texas", country: "US" });
    expect(parseAddress("Manhattan, New York, New York, United States")).toEqual({ locality: "New York", region: "New York", country: "US" });
    expect(parseAddress("Ville-Marie, Montréal, Quebec, Canada")).toEqual({ locality: "Montréal", region: "Quebec", country: "CA" });
    expect(parseAddress("Washington, D.C., District of Columbia, United States")).toEqual({ locality: "Washington", region: "District of Columbia", country: "US" });
    expect(displayName("Hula Hut - Austin", { locality: "Austin" })).toEqual({ name: "Hula Hut", altNames: ["Hula Hut - Austin"] });
    expect(displayName("Tiki-Ti", { locality: "Los Angeles" })).toEqual({ name: "Tiki-Ti", altNames: [] });
    expect(displayName("Holy Diver Tiki Lounge - at Hi-Tones", { locality: "San Antonio" })).toEqual({ name: "Holy Diver Tiki Lounge", altNames: ["Holy Diver Tiki Lounge - at Hi-Tones"] });
    expect(displayName("Mai Kai Lounge -- at the Tecumseh Inn", { locality: "Tecumseh" })).toEqual({ name: "Mai Kai Lounge", altNames: ["Mai Kai Lounge -- at the Tecumseh Inn"] });
    expect(displayName("Trader Vic's - at the Jumeirah Beach Hilton - Dubai", {})).toEqual({ name: "Trader Vic's", altNames: ["Trader Vic's - at the Jumeirah Beach Hilton - Dubai"] });
    expect(displayName("Chi-Chi - Santa Catalina Island", { locality: "Avalon" })).toEqual({ name: "Chi-Chi - Santa Catalina Island", altNames: ["Chi-Chi"] });
  });

  it("builds observations with attribution and no coordinates", () => {
    const row = parseBarPage("hula-hut-austin", fixture("mytiki/hula-hut-austin.html"), AT)!;
    expect(rowToObservation("mytiki", "https://mytiki.life", row)).toMatchObject({
      sourceRef: "hula-hut-austin",
      url: "https://mytiki.life/tiki-bars/hula-hut-austin",
      name: "Hula Hut",
      coords: null,
      coordsPrecision: "none",
      statusHint: null,
      tags: ["tiki-directory"],
      website: "http://www.hulahut.com/",
    });
  });

  it("reads slugs from the sitemap index and section pages", () => {
    expect(parseBarSitemaps(`<sitemapindex><sitemap><loc>https://mytiki.life/sitemaps-1-section-tikiBars-1-sitemap-p1.xml</loc></sitemap><sitemap><loc>https://mytiki.life/sitemaps-1-section-tikiMugs-1-sitemap.xml</loc></sitemap></sitemapindex>`)).toEqual([
      "https://mytiki.life/sitemaps-1-section-tikiBars-1-sitemap-p1.xml",
    ]);
    expect(parseBarSlugs(`<url><loc>https://mytiki.life/tiki-bars/a-b</loc></url><url><loc>https://mytiki.life/tiki-bars/a-b</loc></url><url><loc>https://mytiki.life/tiki-mugs/c</loc></url>`)).toEqual(["a-b"]);
  });
});

describe("mytiki scheduled refresh", () => {
  const row = (slug: string, fetched_at: string, closed: MytikiRow["closed"] = "no"): MytikiRow => ({ slug, name: `Bar ${slug}`, type: "Bar", address: "Austin, Texas, United States", closed, fetched_at });
  const urlset = (entries: [string, string][]) =>
    `<urlset>${entries.map(([slug, lastmod]) => `<url><loc>https://mytiki.life/tiki-bars/${slug}</loc><lastmod>${lastmod}</lastmod><image:image><image:loc>https://assets.mytiki.life/x.jpg</image:loc></image:image></url>`).join("")}</urlset>`;
  const index = `<sitemapindex><sitemap><loc>https://mytiki.life/sitemaps-1-section-tikiBars-1-sitemap-p1.xml</loc></sitemap></sitemapindex>`;
  const page = fixture("mytiki/hula-hut-austin.html");

  afterEach(() => {
    delete process.env.TIKI_ROOT;
  });

  it("reads lastmod per bar and picks new, then edited bars", () => {
    const sitemap = parseBarSitemapEntries(urlset([["kept", "2026-01-01T00:00:00+11:00"], ["edited", "2026-11-20T00:00:00+11:00"], ["new-bar", "2026-11-20T00:00:00Z"]]));
    expect(sitemap.get("edited")).toBe("2026-11-20T00:00:00+11:00");
    const rows = new Map([row("kept", "2026-11-01T00:00:00.000Z"), row("edited", "2026-11-01T00:00:00.000Z")].map((r) => [r.slug, r]));
    expect(barsToRead(sitemap, rows)).toEqual({ missing: ["new-bar"], edited: ["edited"] });
  });

  it("reads only new and edited pages, drops delisted bars, and saves the snapshot", async () => {
    const before = [row("kept", "2026-11-01T00:00:00.000Z"), row("edited", "2026-11-01T00:00:00.000Z"), row("delisted", "2026-11-01T00:00:00.000Z")];
    process.env.TIKI_ROOT = tempRoot({ "data/snapshots/mytiki.json": JSON.stringify(before) });
    const sitemapXml = urlset([["kept", "2026-10-01T00:00:00Z"], ["edited", "2026-11-15T00:00:00Z"], ["brand-new", "2026-11-15T00:00:00Z"], ["also-new", "2026-11-15T00:00:00Z"]]);
    const asked: string[] = [];
    const fetch = Object.assign(
      async (url: string) => {
        asked.push(url);
        const body = url.endsWith("sitemap.xml") ? index : url.includes("section-tikiBars") ? sitemapXml : page;
        return { url, status: 200, body, fromCache: false, fetchedAt: AT, headers: {} };
      },
      { requests: 0, remaining: 99 },
    ) as unknown as PoliteFetch;
    const src = source({ id: "mytiki", adapter: "mytiki", config: { pagesPerRun: 2, pageIntervalMs: 0, jitterMs: 0, minBars: 1 } });
    const { observations, complete } = await mytikiAdapter.discover({ source: src, fetch, now: NOW, log, dryRun: false, prior: [] });

    // New bars first, then edited, capped at pagesPerRun: "also-new" and "brand-new" now, "edited" next run.
    expect(asked.filter((u) => u.includes("/tiki-bars/"))).toEqual(["https://mytiki.life/tiki-bars/also-new", "https://mytiki.life/tiki-bars/brand-new"]);
    expect(complete).toBe(true);
    expect(observations.map((o) => o.sourceRef).sort()).toEqual(["also-new", "brand-new", "edited", "kept"]);
    const saved = readSnapshot("data/snapshots/mytiki.json").map((r) => r.slug);
    expect(saved).toEqual(["also-new", "brand-new", "delisted", "edited", "kept"]);
  });

  it("keeps places it alone lists off the daily Google work while running daily", () => {
    const daily = source({ id: "mytiki", adapter: "mytiki", schedule: { discovery: "daily" }, skipGoogle: true });
    const other = source({ id: "tikirat" });
    const ctx = { sources: new Map([["mytiki", daily], ["tikirat", other]]), now: NOW };
    const o = rowToObservation("mytiki", "https://mytiki.life", row("solo", AT));
    const alone = mergePlace(newPlaceSkeleton("solo", NOW), [o], ctx);
    expect(alone.syncPolicy).toBe("manual");
    expect(mergePlace(alone, [o, { ...o, sourceId: "tikirat", sourceRef: "solo" }], ctx).syncPolicy).toBeUndefined();
  });

  it("keeps what it read when the site throttles, and writes nothing on a dry run", async () => {
    process.env.TIKI_ROOT = tempRoot({ "data/snapshots/mytiki.json": JSON.stringify([row("kept", "2026-11-01T00:00:00.000Z")]) });
    const sitemapXml = urlset([["kept", "2026-10-01T00:00:00Z"], ["a", "2026-11-15T00:00:00Z"], ["b", "2026-11-15T00:00:00Z"]]);
    const { SourceThrottled } = await import("../core/fetch");
    let pages = 0;
    const fetch = Object.assign(
      async (url: string) => {
        if (url.includes("/tiki-bars/") && ++pages > 1) throw new SourceThrottled("mytiki.life", 429, 60);
        const body = url.endsWith("sitemap.xml") ? index : url.includes("section-tikiBars") ? sitemapXml : page;
        return { url, status: 200, body, fromCache: false, fetchedAt: AT, headers: {} };
      },
      { requests: 0, remaining: 99 },
    ) as unknown as PoliteFetch;
    const warnings: string[] = [];
    const src = source({ id: "mytiki", adapter: "mytiki", config: { pageIntervalMs: 0, jitterMs: 0, minBars: 1 } });
    const { observations } = await mytikiAdapter.discover({ source: src, fetch, now: NOW, log: { info() {}, warn: (m: string) => warnings.push(m) }, dryRun: true, prior: [] });
    expect(observations.map((o) => o.sourceRef).sort()).toEqual(["a", "kept"]);
    expect(warnings.join(" ")).toContain("429");
    expect(readSnapshot("data/snapshots/mytiki.json").map((r) => r.slug)).toEqual(["kept"]);
  });
});

describe("google-mymaps", () => {
  it("reads point placemarks with their layer and no descriptions", () => {
    const pms = parseKml(fixture("allthetikibars/map.kml"));
    expect(pms.map((p) => [p.layer, p.name])).toEqual([
      ["Tiki Bars", "Tiki-Ko"],
      ["Tiki Restaurants", "Hula's Island Grill"],
      ["Points of Interest", "Beachcomber Resort & Club"],
      ["Tiki Adjacent Bars - inspired/inclusive/night of tiki", "Soggy Dollar Bar"],
    ]);
    expect(pms[0]).toMatchObject({ lat: 35.376795, lng: -119.0177715 });
    expect(placemarkRef(pms[0]!)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("vouches by layer, attaches others, skips unlisted layers", async () => {
    const pm = (layer: string, i: number) => `<Placemark><name>Bar ${i}</name><description>note</description><Point><coordinates>-118.${i},34.${i},0</coordinates></Point></Placemark>`;
    const folder = (layer: string, n: number) => `<Folder><name>${layer}</name>${Array.from({ length: n }, (_, i) => pm(layer, i + (layer.length * 100))).join("")}</Folder>`;
    const kml = `<?xml version="1.0"?><kml><Document>${folder("Tiki Bars", 55)}${folder("Points of Interest", 2)}${folder("Untitled layer", 3)}</Document></kml>`;
    const fetch = Object.assign(async () => ({ url: "", status: 200, body: kml, fromCache: false, fetchedAt: AT, headers: {} }), { requests: 1, remaining: 2 }) as unknown as PoliteFetch;
    const src = source({ id: "allthetikibars", adapter: "google-mymaps", config: { mid: "1q_mi3YIU4oRxaQQ4iEbjvpK65TZBaYq_", vouchLayers: ["Tiki Bars"], attachLayers: ["Points of Interest"] } });
    const { observations } = await googleMyMapsAdapter.discover({ source: src, fetch, now: NOW, log, dryRun: true, prior: [] });
    expect(observations).toHaveLength(57);
    expect(observations.filter((o) => o.tags.includes("tiki-directory"))).toHaveLength(55);
    expect(observations[0]!.url).toBe("https://www.google.com/maps/d/viewer?mid=1q_mi3YIU4oRxaQQ4iEbjvpK65TZBaYq_");
    expect(JSON.stringify(observations)).not.toContain("note");
  });
});

describe("polite fetch", () => {
  const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "tiki-fetch-"));
  const respond = (status: number, body: string, headers: Record<string, string> = {}) => async () => new Response(body, { status, headers });

  it("stops at a 429 and makes no further requests to that host", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return respond(429, "slow down", { "retry-after": "120" })();
    }) as typeof fetch;
    const f = createPoliteFetch({ cacheDir: cacheDir(), userAgent: "t", minIntervalMs: 0, respectRobots: false, fetchImpl });
    const err = await f("https://example.com/a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceThrottled);
    expect((err as SourceThrottled).retryAfterS).toBe(120);
    await expect(f("https://example.com/b")).rejects.toBeInstanceOf(SourceThrottled);
    expect(calls).toBe(1);
  });

  it("stops at a bot challenge", async () => {
    const f = createPoliteFetch({ cacheDir: cacheDir(), userAgent: "t", minIntervalMs: 0, respectRobots: false, fetchImpl: respond(403, "<html><title>Just a moment...</title></html>") as typeof fetch });
    await expect(f("https://example.com/")).rejects.toBeInstanceOf(ChallengeDetected);
  });

  it("returns ordinary errors to the caller", async () => {
    const f = createPoliteFetch({ cacheDir: cacheDir(), userAgent: "t", minIntervalMs: 0, respectRobots: false, fetchImpl: respond(404, "nope") as typeof fetch });
    expect((await f("https://example.com/")).status).toBe(404);
  });

  it("honours Allow rules, longest match first", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /maps/\nAllow: /maps/d/\nDisallow: /search\nAllow: /maps/$\n", "tiki.place-bot/1.0");
    expect(robotsAllows(rules, "/maps/d/kml?mid=x&forcekml=1")).toBe(true);
    expect(robotsAllows(rules, "/maps/place/x")).toBe(false);
    expect(robotsAllows(rules, "/maps/")).toBe(true);
    expect(robotsAllows(rules, "/search?q=1")).toBe(false);
    expect(robotsAllows(rules, "/about")).toBe(true);
  });
});
