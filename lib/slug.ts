/** Lower-case, ASCII, kebab-case. Strips diacritics, apostrophes and a leading "the". */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical place id: slugify(name)-slugify(locality). Collisions are resolved by the caller. */
export function placeSlug(name: string, locality?: string): string {
  const n = slugify(name) || "place";
  const l = locality ? slugify(locality) : "";
  return l && !n.endsWith(l) ? `${n}-${l}` : n;
}

export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`Could not find a unique slug for ${base}`);
}
