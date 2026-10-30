import { describe, expect, it } from "vitest";
import { overtureAdapter, overtureQuery, rowToObservation } from "../adapters/overture";
import type { PoliteFetch } from "../core/fetch";
import { NOW, source } from "./helpers";

const rows = [
  { id: "2a2b97d6", name: "Last Rites", basic_category: "bar", primary_category: "tiki_bar", confidence: 0.99, lng: -122.42946866, lat: 37.76789777, website: "http://www.lastritesbar.com/", locality: "San Francisco", region: "CA", country: "US" },
  { id: "66864d56", name: "Tiki Taka Sports Bar", basic_category: "bar", primary_category: "sports_bar", confidence: 0.8, lng: 1, lat: 2, website: null, locality: "Madrid", region: null, country: "es" },
  { id: "noname", name: null, basic_category: "bar", primary_category: "tiki_bar", confidence: 0.9, lng: 1, lat: 2, website: null, locality: null, region: null, country: null },
];

describe("overture adapter", () => {
  it("builds the release query", () => {
    const q = overtureQuery({ release: "2026-10-21.0", bucket: "s3://overturemaps-us-west-2/release", region: "us-west-2", minConfidence: 0.5, threads: 8 });
    expect(q).toContain("release/2026-10-21.0/theme=places/type=place/*");
    expect(q).toContain("taxonomy.primary = 'tiki_bar'");
  });
  it("maps rows to observations with category and name tags", () => {
    const o = rowToObservation(rows[0]!, "overture", NOW.toISOString());
    expect(o).toMatchObject({ sourceRef: "2a2b97d6", name: "Last Rites", tags: ["tiki-category", "bar-category"], address: { locality: "San Francisco", region: "CA", country: "US" }, externalIds: { overture: "2a2b97d6" } });
    expect(rowToObservation(rows[1]!, "overture", NOW.toISOString())?.tags).toEqual(["tiki-name", "bar-category"]);
    expect(rowToObservation(rows[2]!, "overture", NOW.toISOString())).toBeNull();
    expect(rowToObservation({ ...rows[0]!, region: "", locality: " " }, "overture", NOW.toISOString())?.address).toEqual({ country: "US" });
  });
  it("discover uses injected rows (no DuckDB in tests)", async () => {
    const src = source({ id: "overture", adapter: "overture", config: { release: "2026-10-21.0", __rows: rows } });
    const result = await overtureAdapter.discover({ source: src, fetch: (() => {}) as unknown as PoliteFetch, now: NOW, log: { info() {}, warn() {} }, dryRun: true, prior: [] });
    expect(result.complete).toBe(true);
    expect(result.observations.map((o) => o.sourceRef)).toEqual(["2a2b97d6", "66864d56"]);
  });
});
