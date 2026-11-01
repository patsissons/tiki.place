import type { PublishedPlace } from "./schema/published";

type Rated = Pick<PublishedPlace, "name" | "rating" | "ratingCount">;

/** Highest rated first, then most reviewed, then by name. Unrated places go last. */
export function byRating(a: Rated, b: Rated): number {
  if (a.rating === undefined || b.rating === undefined) {
    if (a.rating !== b.rating) return a.rating === undefined ? 1 : -1;
  } else if (a.rating !== b.rating) {
    return b.rating - a.rating;
  }
  return (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || a.name.localeCompare(b.name);
}
