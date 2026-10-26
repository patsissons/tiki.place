import { z } from "zod";
import { HoursSchema, StatusValueSchema } from "./common";

/** Compact, client-safe projection of a Place served from public/data/places.json. */
export const PublishedPlaceSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  lat: z.number(),
  lng: z.number(),
  locality: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  formattedAddress: z.string().optional(),
  timezone: z.string().optional(),
  status: StatusValueSchema,
  hours: HoursSchema.optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  googleMapsUri: z.string().optional(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  established: z.number().optional(),
  tikiConfidence: z.number(),
  verified: z.boolean(),
  lastVerifiedAt: z.string().optional(),
  sources: z.array(z.strictObject({ id: z.string(), url: z.string().optional() })),
});
export type PublishedPlace = z.infer<typeof PublishedPlaceSchema>;

export const ManifestSchema = z.strictObject({
  version: z.literal(1),
  hash: z.string(),
  count: z.number().int(),
  countries: z.record(z.string(), z.number().int()),
});
export type Manifest = z.infer<typeof ManifestSchema>;
