/**
 * Overture Maps places (CDLA-Permissive 2.0 / Apache 2.0 depending on provider; no OSM data).
 * A monthly DuckDB query against the public GeoParquet release pulls every place in the
 * `tiki_bar` taxonomy plus bar-like places with "tiki" in the name. DuckDB is loaded lazily
 * so the daily sync never needs it.
 */
import { z } from "zod";
import { roundCoord } from "@/lib/geo";
import { looksTiki } from "@/lib/text";
import type { Observation, ObservationTag } from "@/lib/schema";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  /** Overture release id, e.g. 2026-10-21.0. Bump it monthly (the skill does this). */
  release: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  bucket: z.string().default("s3://overturemaps-us-west-2/release"),
  region: z.string().default("us-west-2"),
  /** Skip rows below this Overture existence confidence. */
  minConfidence: z.number().min(0).max(1).default(0.5),
  threads: z.number().int().min(1).default(8),
});

export const OvertureRowSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  basic_category: z.string().nullable(),
  primary_category: z.string().nullable(),
  confidence: z.number().nullable(),
  lng: z.number(),
  lat: z.number(),
  locality: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});
export type OvertureRow = z.infer<typeof OvertureRowSchema>;

/**
 * Only light parquet leaves: bbox instead of geometry, a few address fields, one website.
 * The worldwide scan is network-bound, so every extra column costs minutes.
 */
export function overtureQuery(config: z.infer<typeof ConfigSchema>): string {
  const src = `read_parquet('${config.bucket}/${config.release}/theme=places/type=place/*', hive_partitioning=1)`;
  return `
    SELECT id, names.primary AS name, basic_category, taxonomy.primary AS primary_category, confidence,
           bbox.xmin AS lng, bbox.ymin AS lat,
           addresses[1].locality AS locality, addresses[1].region AS region, addresses[1].country AS country,
           websites[1] AS website
    FROM ${src}
    WHERE (taxonomy.primary = 'tiki_bar'
       OR (lower(names.primary) LIKE '%tiki%' AND basic_category IN ('bar','restaurant','night_club','pub')))
      AND confidence >= ${config.minConfidence}
    ORDER BY id`;
}

export async function queryOverture(config: z.infer<typeof ConfigSchema>): Promise<OvertureRow[]> {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await connection.run(`INSTALL httpfs; LOAD httpfs; SET s3_region='${config.region}'; SET threads=${config.threads};`);
    const reader = await connection.runAndReadAll(overtureQuery(config));
    return z.array(OvertureRowSchema).parse(reader.getRowObjectsJson());
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

export function rowToObservation(row: OvertureRow, sourceId: string, observedAt: string): Observation | null {
  if (!row.name) return null;
  const tags: ObservationTag[] = [];
  if (row.primary_category === "tiki_bar") tags.push("tiki-category");
  if (looksTiki(row.name)) tags.push("tiki-name");
  if (["bar", "restaurant", "night_club", "pub"].includes(row.basic_category ?? "")) tags.push("bar-category");
  const country = row.country?.toUpperCase();
  return makeObservation({
    sourceId,
    sourceRef: row.id,
    url: `https://explore.overturemaps.org/#17/${row.lat}/${row.lng}`,
    name: row.name,
    address: {
      locality: row.locality ?? undefined,
      region: row.region ?? undefined,
      country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    },
    coords: { lat: roundCoord(row.lat, 7), lng: roundCoord(row.lng, 7) },
    coordsPrecision: "rooftop",
    website: safeUrl(row.website),
    statusHint: null,
    categories: [row.basic_category, row.primary_category].filter((v): v is string => Boolean(v)),
    tags,
    externalIds: { overture: row.id },
    observedAt,
  });
}

export const overtureAdapter: Adapter = {
  id: "overture",
  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const releaseAge = (ctx.now.getTime() - Date.parse(config.release.slice(0, 10))) / 86_400_000;
    if (releaseAge > 75) ctx.log.warn(`overture: release ${config.release} is ${Math.round(releaseAge)} days old; bump config.release`);
    const rows = await (ctx.source.config.__rows ? Promise.resolve(z.array(OvertureRowSchema).parse(ctx.source.config.__rows)) : queryOverture(config));
    const observedAt = ctx.now.toISOString();
    const fresh = rows.map((r) => rowToObservation(r, ctx.source.id, observedAt)).filter((o): o is Observation => o !== null);
    ctx.log.info(`overture: ${fresh.length} rows from release ${config.release}`);
    return { observations: reconcileObservations(ctx.prior, fresh), complete: true };
  },
};
