import { describe, expect, it } from "vitest";
import { nextReviewState, tikiConfidence } from "../core/confidence";
import { deriveStatus } from "../core/status";
import { NOW, obs, place, source } from "./helpers";

const sources = new Map([
  ["google", source({ id: "google", adapter: "google", tikiSignal: 0.05 })],
  ["tikirat", source({ id: "tikirat", tikiSignal: 0.85 })],
  ["tikiwanderlust", source({ id: "tikiwanderlust", adapter: "tikiwanderlust", tikiSignal: 0.8 })],
]);

describe("tikiConfidence", () => {
  it("combines independent signals with noisy-OR", () => {
    const p = place({ id: "x", name: "Hale Pele" });
    expect(tikiConfidence(p, [obs({ sourceId: "tikirat", sourceRef: "a", name: "Hale Pele", tags: ["tiki-directory"] })], sources)).toBe(0.85);
    const two = [
      obs({ sourceId: "tikirat", sourceRef: "a", name: "Hale Pele", tags: ["tiki-directory"] }),
      obs({ sourceId: "tikiwanderlust", sourceRef: "b", name: "Hale Pele", tags: ["tiki-directory"] }),
    ];
    expect(tikiConfidence(p, two, sources)).toBe(0.97);
    const named = place({ id: "y", name: "Tonga Hut" });
    expect(tikiConfidence(named, [obs({ sourceId: "google", sourceRef: "g", name: "Tonga Hut", tags: ["bar-category"] })], sources)).toBe(0.335);
  });
});

describe("nextReviewState", () => {
  it("auto-approves only with location + google + confidence, never demotes, owner wins", () => {
    const base = place({ id: "x", location: { lat: 1, lng: 1, precision: "rooftop" }, externalIds: { google: "g" } });
    expect(nextReviewState(base, 0.85).state).toBe("auto_approved");
    expect(nextReviewState({ ...base, externalIds: {} }, 0.85).state).toBe("needs_review");
    expect(nextReviewState({ ...base, externalIds: {} }, 0.97).state).toBe("auto_approved");
    expect(nextReviewState({ ...base, location: null }, 0.99).state).toBe("needs_review");
    const approvedAuto = { ...base, review: { ...base.review, state: "auto_approved" as const } };
    expect(nextReviewState(approvedAuto, 0.1).state).toBe("auto_approved");
    const rejected = { ...base, review: { state: "rejected" as const, by: "owner" as const, at: "2026-01-01T00:00:00.000Z", reason: "no" } };
    expect(nextReviewState(rejected, 0.99)).toEqual({ state: "rejected", reason: "no" });
  });
});

describe("deriveStatus", () => {
  const p = place({ id: "x", lastVerifiedAt: "2026-10-20T00:00:00.000Z" });
  it("prefers fresh google, then directory hints, then unverified", () => {
    const g = obs({ sourceId: "google", sourceRef: "g", name: "x", statusHint: "temporarily_closed", observedAt: "2026-10-20T00:00:00.000Z" });
    expect(deriveStatus(p, [g], NOW)).toMatchObject({ value: "temporarily_closed", sourceId: "google" });
    const hint = obs({ sourceId: "tikiwanderlust", sourceRef: "t", name: "x", statusHint: "coming_soon", observedAt: "2026-10-01T00:00:00.000Z" });
    expect(deriveStatus(p, [hint], NOW)).toMatchObject({ value: "coming_soon", sourceId: "tikiwanderlust" });
    const stale = { ...p, lastVerifiedAt: "2025-01-01T00:00:00.000Z" };
    expect(deriveStatus(stale, [], NOW).value).toBe("unverified");
  });
  it("keeps the timestamp when nothing changed", () => {
    const g = obs({ sourceId: "google", sourceRef: "g", name: "x", statusHint: "open", observedAt: "2026-10-20T00:00:00.000Z" });
    const withStatus = { ...p, status: { value: "open" as const, sourceId: "google", at: "2026-09-01T00:00:00.000Z" } };
    expect(deriveStatus(withStatus, [g], NOW).at).toBe("2026-09-01T00:00:00.000Z");
  });
});
