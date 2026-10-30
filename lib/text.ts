/** Name normalization and similarity used by entity resolution. No dependencies. */

const GENERIC_TOKENS = new Set([
  "bar",
  "lounge",
  "tiki",
  "restaurant",
  "cocktail",
  "cocktails",
  "room",
  "the",
  "and",
  "at",
  "of",
  "cafe",
  "grill",
  "kitchen",
  "pub",
  "club",
  "tavern",
  "saloon",
  "inn",
]);

export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

export function tokens(normalized: string): string[] {
  return normalized ? normalized.split(" ") : [];
}

function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

function bigrams(s: string): Set<string> {
  const compact = s.replace(/ /g, "");
  const out = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) out.add(compact.slice(i, i + 2));
  return out;
}

function stripGeneric(toks: string[]): string[] {
  const kept = toks.filter((t) => !GENERIC_TOKENS.has(t));
  return kept.length > 0 ? kept : toks;
}

/**
 * Similarity in [0,1] between two venue names. Robust to apostrophes, punctuation,
 * "The", and generic suffixes ("Bar", "Lounge"). Not symmetric-safe for prefix
 * containment: "Trader Vic's" vs "Trader Vic's Mayfair" scores below 0.85.
 */
export function nameSim(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(na);
  const tb = tokens(nb);
  const full = Math.max(dice(new Set(ta), new Set(tb)), dice(bigrams(na), bigrams(nb)));
  const sa = stripGeneric(ta);
  const sb = stripGeneric(tb);
  const stripped = Math.max(dice(new Set(sa), new Set(sb)), dice(bigrams(sa.join(" ")), bigrams(sb.join(" "))));
  return Math.max(full, stripped);
}

export const TIKI_NAME_PATTERN =
  /\b(tiki|trader|luau|mai ?tai|hula|kon[ -]?tiki|zombie|polynesian|tonga|aloha|lanai|hukilau|kahiki|bali ?hai|outrigger|castaway|beachcomber|rum ?runner)\b/i;

export function looksTiki(name: string): boolean {
  return TIKI_NAME_PATTERN.test(name);
}

/** First run of digits in a street line, for address corroboration. */
export function streetNumber(street?: string): string | undefined {
  const m = street?.match(/\d+[a-z]?/i);
  return m?.[0]?.toLowerCase();
}
