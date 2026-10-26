import { z } from "zod";
import { AdapterIdSchema, IsoDate, SlugSchema } from "./common";

export const SourceStatusSchema = z.enum(["active", "paused", "retired"]);

export const SourceSchema = z.strictObject({
  id: SlugSchema,
  name: z.string().min(1),
  homepage: z.url(),
  adapter: AdapterIdSchema,
  status: SourceStatusSchema,
  license: z.strictObject({
    name: z.string().min(1),
    url: z.url().optional(),
    attribution: z.string().min(1),
  }),
  /** Prior weight for field precedence when two sources disagree (0-1). */
  trust: z.number().min(0).max(1),
  /** P(place is a tiki place | listed by this source), used by confidence scoring (0-1). */
  tikiSignal: z.number().min(0).max(1),
  schedule: z.strictObject({
    discovery: z.enum(["daily", "weekly", "monthly", "manual"]),
    /** For sources with a detail pass: re-fetch a record's detail page after this many days. */
    detailRefreshDays: z.number().int().min(1).optional(),
  }),
  politeness: z
    .strictObject({
      minIntervalMs: z.number().int().min(0),
      maxRequestsPerRun: z.number().int().min(1),
      userAgent: z.string().min(1),
    })
    .optional(),
  /** Adapter-specific configuration. */
  config: z.record(z.string(), z.unknown()).default({}),
  addedAt: IsoDate,
  retiredAt: IsoDate.optional(),
  notes: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;
