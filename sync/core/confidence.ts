/** Tiki confidence (noisy-OR over independent source signals) and review-state policy. */
import { looksTiki } from "@/lib/text";
import type { Observation, Place, ReviewState, Source } from "@/lib/schema";

export const WEAK_RESOLUTION_REASON = "weak google match; confirm this is the right place";

const TAG_WEIGHT = {
  "tiki-category": 0.75,
  "tiki-name": 0.3,
  "bar-category": 0.05,
} as const;

const NAME_KEYWORD_WEIGHT = 0.3;

export function tikiConfidence(place: Place, observations: Observation[], sources: Map<string, Source>): number {
  const perSource = new Map<string, number>();
  for (const o of observations) {
    let w = 0;
    for (const tag of o.tags) {
      if (tag === "tiki-directory") w = Math.max(w, sources.get(o.sourceId)?.tikiSignal ?? 0.5);
      else w = Math.max(w, TAG_WEIGHT[tag]);
    }
    perSource.set(o.sourceId, Math.max(perSource.get(o.sourceId) ?? 0, w));
  }
  const weights = [...perSource.values()];
  if ([place.name, ...place.aliases, ...observations.map((o) => o.name)].some(looksTiki)) weights.push(NAME_KEYWORD_WEIGHT);
  const miss = weights.reduce((acc, w) => acc * (1 - w), 1);
  return Math.round((1 - miss) * 1000) / 1000;
}

/**
 * Owner decisions are final. Auto decisions only ever move up (needs_review -> auto_approved).
 */
export function nextReviewState(place: Place, confidence: number): { state: ReviewState; reason?: string } {
  const current = place.review;
  if (current.by === "owner") return { state: current.state, reason: current.reason };
  if (current.state === "auto_approved") return { state: "auto_approved" };
  const weak = current.reason === WEAK_RESOLUTION_REASON;
  const hasGoogle = Boolean(place.externalIds.google);
  const hasLocation = place.location !== null;
  if (hasLocation && ((confidence >= 0.8 && hasGoogle && !weak) || confidence >= 0.95)) return { state: "auto_approved" };
  return { state: "needs_review", reason: current.reason };
}
