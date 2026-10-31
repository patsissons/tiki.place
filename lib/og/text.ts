import { STATUS_COLOR, STATUS_LABEL } from "@/lib/client/status";
import type { StatusValue } from "@/lib/schema/common";

/** Open Graph card dimensions, the 1.91:1 size every network renders at full width. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const STATUS_TEXT: Record<StatusValue, { label: string; color: string }> = Object.fromEntries(
  (Object.keys(STATUS_LABEL) as StatusValue[]).map((s) => [s, { label: STATUS_LABEL[s], color: STATUS_COLOR[s] }]),
) as Record<StatusValue, { label: string; color: string }>;

/** Headline font size so long names still fit in two lines across the card's 1072px column. */
export function headlineSize(text: string): number {
  const n = text.length;
  if (n <= 18) return 96;
  if (n <= 28) return 80;
  if (n <= 40) return 64;
  return 52;
}

export const pluralize = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export type Fact = { kind: "rating" | "price" | "established"; text: string };

/** Facts shown on a place card, in display order, omitting anything the record lacks. */
export function placeFacts(p: { rating?: number; ratingCount?: number; priceLevel?: string; established?: number }): Fact[] {
  const out: Fact[] = [];
  if (p.rating !== undefined) out.push({ kind: "rating", text: `${p.rating.toFixed(1)}${p.ratingCount ? ` (${p.ratingCount.toLocaleString("en-US")})` : ""}` });
  if (p.priceLevel) out.push({ kind: "price", text: p.priceLevel });
  if (p.established) out.push({ kind: "established", text: `est. ${p.established}` });
  return out;
}

/** "Verified October 2026" from an ISO timestamp; deterministic for a given data file. */
export function verifiedLine(iso?: string): string {
  if (!iso) return "Community listed";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Community listed";
  return `Verified ${d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}
