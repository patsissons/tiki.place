import { z } from "zod";
import { IsoDateTime, SlugSchema } from "./common";

const base = {
  at: IsoDateTime,
  by: z.enum(["owner", "skill"]).default("owner"),
  note: z.string().optional(),
};

/** Owner decisions are append-only data, replayed on every sync after merge. */
export const DecisionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("approve"), place: SlugSchema, ...base }),
  z.strictObject({ type: z.literal("reject"), place: SlugSchema, reason: z.string().min(1), ...base }),
  /** Force a source record (key = "sourceId:sourceRef") to resolve to a given place. */
  z.strictObject({ type: z.literal("link"), key: z.string().min(3), place: SlugSchema, ...base }),
  /** Merge `from` into `into`; `from` becomes a redirect. */
  z.strictObject({ type: z.literal("merge"), from: SlugSchema, into: SlugSchema, ...base }),
  /** Pin a field to a value regardless of what sources say. */
  z.strictObject({
    type: z.literal("pin"),
    place: SlugSchema,
    field: z.enum(["name", "location", "address", "contact.website", "contact.phone", "established", "timezone"]),
    value: z.unknown(),
    ...base,
  }),
  /** Attach a Google Place ID the owner looked up by hand. */
  z.strictObject({ type: z.literal("resolve"), place: SlugSchema, google: z.string().min(1), ...base }),
]);
export type Decision = z.infer<typeof DecisionSchema>;
export const DecisionsFileSchema = z.array(DecisionSchema);
