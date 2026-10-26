import { z } from "zod";

export const GoogleSkuSchema = z.enum(["essentials", "pro", "enterprise", "textSearch"]);
export type GoogleSku = z.infer<typeof GoogleSkuSchema>;

export const SkuCountsSchema = z.strictObject({
  essentials: z.number().int().min(0).default(0),
  pro: z.number().int().min(0).default(0),
  enterprise: z.number().int().min(0).default(0),
  textSearch: z.number().int().min(0).default(0),
});
export type SkuCounts = z.infer<typeof SkuCountsSchema>;

export const LedgerSchema = z.strictObject({
  version: z.literal(1),
  /** keyed by YYYY-MM */
  months: z.record(z.string().regex(/^\d{4}-\d{2}$/), SkuCountsSchema).default({}),
  /** keyed by YYYY-MM-DD */
  days: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), SkuCountsSchema).default({}),
});
export type Ledger = z.infer<typeof LedgerSchema>;

export const emptyLedger = (): Ledger => ({ version: 1, months: {}, days: {} });
