import yaml from "js-yaml";
import { z } from "zod";

const timeStringSchema = z
  .string()
  .regex(/^\d{4}$/, "Time must use HHMM 24-hour format.");

const addressSchema = z.object({
  countryCode: z.string().min(2),
  country: z.string().min(1),
  region: z.string().min(1),
  locality: z.string().min(1),
  postalCode: z.string().min(1),
  streetAddress: z.string().min(1),
});

const periodEdgeSchema = z.object({
  day: z.number().int().min(0).max(6),
  time: timeStringSchema,
});

export const openingPeriodSchema = z.object({
  open: periodEdgeSchema,
  close: periodEdgeSchema,
});

export const tikiBarSchema = z.object({
  placeId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  formattedAddress: z.string().min(1),
  address: addressSchema,
  googleMapsUrl: z.string().url(),
  rating: z.number().min(0).max(5),
  userRatingCount: z.number().int().min(0),
  weekdayText: z.array(z.string()),
  openingPeriods: z.array(openingPeriodSchema),
  timeZone: z.string().min(1),
  businessStatus: z.string().min(1),
  websiteUrl: z.string().url().optional(),
  lastSyncedAt: z.string().datetime(),
});

export const tikiDatasetSchema = z
  .object({
    bars: z.array(tikiBarSchema),
  })
  .superRefine((dataset, ctx) => {
    const ids = new Set<string>();
    for (const [index, bar] of dataset.bars.entries()) {
      if (ids.has(bar.placeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate placeId: ${bar.placeId}`,
          path: ["bars", index, "placeId"],
        });
      }
      ids.add(bar.placeId);
    }
  });

export type TikiBar = z.infer<typeof tikiBarSchema>;
export type TikiDataset = z.infer<typeof tikiDatasetSchema>;

export function parseTikiDataset(content: string): TikiDataset {
  const parsed = yaml.load(content);
  return tikiDatasetSchema.parse(parsed);
}

export function stringifyTikiDataset(dataset: TikiDataset) {
  return yaml.dump(dataset, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}
