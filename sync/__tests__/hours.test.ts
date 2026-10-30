import { describe, expect, it } from "vitest";
import { isOpenNow, localMoment, openStateAt } from "@/lib/hours";

const overnight = {
  periods: [
    { open: { day: 5, time: "1700" }, close: { day: 6, time: "0200" } },
    { open: { day: 6, time: "1700" }, close: { day: 0, time: "0130" } },
  ],
  weekdayText: [],
};

describe("hours", () => {
  it("handles overnight periods across the week boundary", () => {
    expect(openStateAt(overnight, { day: 6, minutes: 60 }).open).toBe(true); // Sat 01:00, still Friday's session
    expect(openStateAt(overnight, { day: 6, minutes: 180 }).open).toBe(false);
    expect(openStateAt(overnight, { day: 0, minutes: 30 }).open).toBe(true); // Sun 00:30
    expect(openStateAt(overnight, { day: 0, minutes: 120 }).open).toBe(false);
    const closed = openStateAt(overnight, { day: 1, minutes: 600 });
    expect(closed.open).toBe(false);
    if (!closed.open) expect(closed.opensAt).toEqual({ day: 5, minutes: 17 * 60 });
  });
  it("treats a period with no close as always open", () => {
    expect(openStateAt({ periods: [{ open: { day: 0, time: "0000" } }], weekdayText: [] }, { day: 3, minutes: 700 }).open).toBe(true);
  });
  it("uses the venue timezone", () => {
    const hours = { periods: [{ open: { day: 0, time: "1700" }, close: { day: 1, time: "0000" } }], weekdayText: [] };
    const sundayEveningSF = new Date("2026-11-02T02:00:00Z"); // Sun 18:00 PST
    expect(isOpenNow(hours, "America/Los_Angeles", sundayEveningSF)).toBe(true);
    expect(isOpenNow(hours, "Australia/Sydney", sundayEveningSF)).toBe(false); // Mon 13:00 AEDT
    expect(localMoment(sundayEveningSF, "America/Los_Angeles")).toEqual({ day: 0, minutes: 18 * 60 });
  });
});
