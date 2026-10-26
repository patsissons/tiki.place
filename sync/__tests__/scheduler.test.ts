import { describe, expect, it } from "vitest";
import { emptyLedger } from "@/lib/schema";
import { GoogleBudget, planGoogleWork } from "../core/scheduler";
import { NOW, place } from "./helpers";

const monthlyFree = { essentials: 10000, pro: 5000, enterprise: 1000, textSearch: 5000 };

describe("GoogleBudget", () => {
  it("caps per day and per month, counting text search against pro", () => {
    const b = new GoogleBudget(emptyLedger(), { monthlyFree, textSearchDailyCap: 20 }, NOW);
    expect(b.dailyCap("enterprise")).toBe(27);
    expect(b.dailyCap("pro")).toBe(137);
    expect(b.dailyCap("textSearch")).toBe(20);
    for (let i = 0; i < 20; i++) b.spend("textSearch");
    expect(b.canSpend("textSearch")).toBe(false);
    expect(b.remainingToday("pro")).toBe(117);
    for (let i = 0; i < 27; i++) b.spend("enterprise");
    expect(b.canSpend("enterprise")).toBe(false);
  });
  it("stops at 90% of the month", () => {
    const ledger = emptyLedger();
    ledger.months["2026-11"] = { essentials: 0, pro: 0, enterprise: 900, textSearch: 0 };
    const b = new GoogleBudget(ledger, { monthlyFree, textSearchDailyCap: 20 }, NOW);
    expect(b.canSpend("enterprise")).toBe(false);
  });
});

describe("planGoogleWork", () => {
  it("prioritises unresolved candidates, oldest verifications, then stale status", () => {
    const b = new GoogleBudget(emptyLedger(), { monthlyFree, textSearchDailyCap: 1 }, NOW);
    const places = [
      place({ id: "new-high", tikiConfidence: 0.9 }),
      place({ id: "new-low", tikiConfidence: 0.3 }),
      place({ id: "rejected", review: { state: "rejected", by: "owner", at: "2026-01-01T00:00:00.000Z", reason: "x" } }),
      place({ id: "old", externalIds: { google: "a" }, lastVerifiedAt: "2026-01-01T00:00:00.000Z" }),
      place({ id: "recent", externalIds: { google: "b" }, lastVerifiedAt: "2026-10-30T00:00:00.000Z" }),
      place({ id: "retry-later", resolution: { attemptedAt: "2026-10-30T00:00:00.000Z", result: "none", candidates: [] } }),
    ];
    const plan = planGoogleWork(places, b, NOW, { lastGoogleSeenAt: (p) => p.lastVerifiedAt });
    expect(plan.resolve.map((p) => p.id)).toEqual(["new-high"]);
    expect(plan.refresh.map((p) => p.id)).toEqual(["old", "recent"]);
    expect(plan.statusCheck).toEqual([]);
  });
});
