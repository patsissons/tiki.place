import { z } from "zod";
import {
  AddressSchema,
  CoordsSchema,
  ExternalIdsSchema,
  HoursSchema,
  IsoDate,
  IsoDateTime,
  RatingSchema,
  StatusHintSchema,
} from "./common";

/** Normalized tags adapters may attach to an observation. */
export const ObservationTagSchema = z.enum([
  "tiki-directory", // listed by a tiki-specific directory
  "tiki-category", // source categorizes it as a tiki bar
  "tiki-name", // name matched tiki keywords
  "bar-category", // source categorizes it as a bar / restaurant / nightclub
]);
export type ObservationTag = z.infer<typeof ObservationTagSchema>;

/**
 * One source's view of one place at one point in time. Adapters emit these;
 * the engine never reads raw source payloads.
 */
export const ObservationSchema = z.strictObject({
  sourceId: z.string().min(1),
  /** Stable key inside the source (slug, "node/123", place id, "issue-42"). */
  sourceRef: z.string().min(1),
  url: z.url().optional(),
  name: z.string().min(1),
  altNames: z.array(z.string().min(1)).default([]),
  address: AddressSchema.default({}),
  formattedAddress: z.string().min(1).optional(),
  coords: CoordsSchema.nullable(),
  coordsPrecision: z.enum(["rooftop", "approximate", "locality", "none"]),
  phone: z.string().min(1).optional(),
  website: z.url().optional(),
  statusHint: StatusHintSchema.nullable(),
  /** Raw category strings from the source. */
  categories: z.array(z.string()).default([]),
  tags: z.array(ObservationTagSchema).default([]),
  externalIds: ExternalIdsSchema.default({}),
  established: z.number().int().min(1800).max(2100).optional(),
  // Rich fields (currently Google only)
  hours: HoursSchema.optional(),
  rating: RatingSchema.optional(),
  priceLevel: z.string().min(1).optional(),
  utcOffsetMinutes: z.number().int().optional(),
  googleMapsUri: z.url().optional(),
  /** When we fetched this fact. */
  observedAt: IsoDateTime,
  /** When the source itself says it last verified the record (e.g. tikirat "Last verified"). */
  sourceVerifiedAt: IsoDate.optional(),
  /** Hash of the normalized payload, to detect change without diffing. */
  rawHash: z.string().regex(/^[0-9a-f]{16}$/),
});
export type Observation = z.infer<typeof ObservationSchema>;

export function observationKey(o: Pick<Observation, "sourceId" | "sourceRef">) {
  return `${o.sourceId}:${o.sourceRef}`;
}
