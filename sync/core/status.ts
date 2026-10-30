/** Derive a place's open/closed status from recent observations. */
import type { Observation, Place } from "@/lib/schema";

const DAY = 86_400_000;

export function deriveStatus(place: Place, observations: Observation[], now: Date): Place["status"] {
  const age = (iso: string) => (now.getTime() - Date.parse(iso)) / DAY;
  const google = observations
    .filter((o) => o.sourceId === "google" && o.statusHint)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (google && age(google.observedAt) <= 45) return keepAt(place, { value: google.statusHint!, sourceId: "google" }, google.observedAt);

  const hint = observations
    .filter((o) => o.sourceId !== "google" && o.statusHint && o.statusHint !== "open" && age(o.observedAt) <= 90)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (hint) return keepAt(place, { value: hint.statusHint!, sourceId: hint.sourceId }, hint.observedAt);

  if (google && age(google.observedAt) <= 180) return keepAt(place, { value: google.statusHint!, sourceId: "google" }, google.observedAt);

  if (!place.lastVerifiedAt || age(place.lastVerifiedAt) > 180) {
    if (place.status.value === "closed") return place.status; // closed stays closed until re-verified
    return keepAt(place, { value: "unverified", sourceId: "system" }, now.toISOString());
  }
  return place.status;
}

/** Only move the `at` timestamp when the value or source actually changes. */
function keepAt(place: Place, next: { value: Place["status"]["value"]; sourceId: string }, at: string): Place["status"] {
  if (place.status.value === next.value && place.status.sourceId === next.sourceId) return place.status;
  return { ...next, at };
}
