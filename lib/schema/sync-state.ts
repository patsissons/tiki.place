import { z } from "zod";
import { IsoDateTime } from "./common";

export const SourceRunStateSchema = z.strictObject({
  lastRunAt: IsoDateTime.optional(),
  lastDiscoveryAt: IsoDateTime.optional(),
  lastStatus: z.enum(["ok", "error", "skipped"]).optional(),
  observationCount: z.number().int().min(0).default(0),
  requestCount: z.number().int().min(0).default(0),
  error: z.string().optional(),
});

export const RunSummarySchema = z.strictObject({
  at: IsoDateTime,
  durationMs: z.number().int().min(0),
  sources: z.array(z.string()),
  placesCreated: z.number().int().min(0),
  placesUpdated: z.number().int().min(0),
  placesPublished: z.number().int().min(0),
  needsReview: z.number().int().min(0),
  googleCalls: z.number().int().min(0),
  warnings: z.array(z.string()).default([]),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const SyncStateSchema = z.strictObject({
  version: z.literal(1),
  sources: z.record(z.string(), SourceRunStateSchema).default({}),
  /** Most recent runs, newest first, capped. */
  runs: z.array(RunSummarySchema).default([]),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export const emptySyncState = (): SyncState => ({ version: 1, sources: {}, runs: [] });
