import { z } from "zod";
import {
  AddressSchema,
  CoordsSchema,
  ExternalIdsSchema,
  HoursSchema,
  IsoDateTime,
  PrecisionSchema,
  RatingSchema,
  SlugSchema,
  StatusValueSchema,
} from "./common";

export const ReviewStateSchema = z.enum(["auto_approved", "needs_review", "approved", "rejected"]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const ProvenanceEntrySchema = z.strictObject({
  sourceId: z.string().min(1),
  observedAt: IsoDateTime,
});

export const PlaceSourceSchema = z.strictObject({
  sourceId: z.string().min(1),
  sourceRef: z.string().min(1),
  url: z.url().optional(),
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  /** Set when a full discovery pass of the source no longer lists this ref. */
  missingSince: IsoDateTime.optional(),
});
export type PlaceSource = z.infer<typeof PlaceSourceSchema>;

export const PlaceSchema = z.strictObject({
  /** Immutable slug: slugify(name)-slugify(locality). */
  id: SlugSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  location: CoordsSchema.extend({ precision: PrecisionSchema }).nullable(),
  address: AddressSchema.default({}),
  formattedAddress: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  externalIds: ExternalIdsSchema.default({}),
  status: z.strictObject({
    value: StatusValueSchema,
    sourceId: z.string().min(1),
    at: IsoDateTime,
  }),
  hours: HoursSchema.optional(),
  contact: z
    .strictObject({
      phone: z.string().min(1).optional(),
      website: z.url().optional(),
      googleMapsUri: z.url().optional(),
    })
    .default({}),
  rating: RatingSchema.extend({ at: IsoDateTime }).optional(),
  priceLevel: z.string().min(1).optional(),
  established: z.number().int().min(1800).max(2100).optional(),
  /** 0-1, how confident we are this is a tiki place (noisy-OR over source signals). */
  tikiConfidence: z.number().min(0).max(1),
  review: z.strictObject({
    state: ReviewStateSchema,
    by: z.enum(["auto", "owner"]),
    at: IsoDateTime,
    reason: z.string().optional(),
  }),
  /** Which source supplied each field, keyed by field path (e.g. "name", "location", "contact.website"). */
  provenance: z.record(z.string(), ProvenanceEntrySchema).default({}),
  sources: z.array(PlaceSourceSchema),
  /** "manual": only manually refreshed sources list this place, so the daily sync spends no Google budget on it. */
  syncPolicy: z.literal("manual").optional(),
  /** Last attempt to resolve this place to a Google Place ID, when none is known. */
  resolution: z
    .strictObject({
      attemptedAt: IsoDateTime,
      result: z.enum(["none", "ambiguous", "rejected"]),
      candidates: z.array(
        z.strictObject({
          googleId: z.string().min(1),
          name: z.string().min(1),
          distanceM: z.number().min(0).nullable(),
          nameSim: z.number().min(0).max(1),
        }),
      ),
    })
    .optional(),
  firstSeenAt: IsoDateTime,
  lastSyncedAt: IsoDateTime,
  /** Last time a verifier (Google) confirmed the record. */
  lastVerifiedAt: IsoDateTime.optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export function isPublished(place: Place) {
  return (
    (place.review.state === "auto_approved" || place.review.state === "approved") &&
    place.location !== null
  );
}
