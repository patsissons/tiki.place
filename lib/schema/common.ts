import { z } from "zod";

/** ISO-8601 UTC timestamp, e.g. 2026-11-01T10:17:00.000Z */
export const IsoDateTime = z.iso.datetime();
/** ISO-8601 calendar date, e.g. 2026-11-01 */
export const IsoDate = z.iso.date();

export const CoordsSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coords = z.infer<typeof CoordsSchema>;

export const PrecisionSchema = z.enum(["rooftop", "approximate", "locality"]);
export type Precision = z.infer<typeof PrecisionSchema>;

export const CountryCode = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, upper case");

export const AddressSchema = z.strictObject({
  street: z.string().min(1).optional(),
  locality: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: CountryCode.optional(),
});
export type Address = z.infer<typeof AddressSchema>;

/** Google-style opening hours. day 0 = Sunday, time = "HHMM" local. A period with no close is open 24h from `open`. */
export const HoursEdgeSchema = z.strictObject({
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/, "HHMM"),
});
export const HoursPeriodSchema = z.strictObject({
  open: HoursEdgeSchema,
  close: HoursEdgeSchema.optional(),
});
export const HoursSchema = z.strictObject({
  periods: z.array(HoursPeriodSchema),
  weekdayText: z.array(z.string()).default([]),
});
export type Hours = z.infer<typeof HoursSchema>;
export type HoursPeriod = z.infer<typeof HoursPeriodSchema>;

export const StatusValueSchema = z.enum(["open", "temporarily_closed", "closed", "coming_soon", "unverified"]);
export type StatusValue = z.infer<typeof StatusValueSchema>;

export const StatusHintSchema = z.enum(["open", "temporarily_closed", "closed", "coming_soon"]);
export type StatusHint = z.infer<typeof StatusHintSchema>;

/** External identifiers keyed by source id (e.g. { google: "ChIJ...", osm: "node/123" }). */
export const ExternalIdsSchema = z.record(z.string(), z.string().min(1));
export type ExternalIds = z.infer<typeof ExternalIdsSchema>;

export const RatingSchema = z.strictObject({
  value: z.number().min(0).max(5),
  count: z.number().int().min(0),
});

export const SlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case slug");

export const AdapterIdSchema = z.enum([
  "google",
  "tikirat",
  "tikiwanderlust",
  "osm-overpass",
  "overture",
  "user-submission",
]);
export type AdapterId = z.infer<typeof AdapterIdSchema>;
