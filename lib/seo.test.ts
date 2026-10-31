import { describe, expect, it } from "vitest";
import type { PublishedPlace } from "./schema/published";
import { SITE, absoluteUrl, openingHoursSpecification, pageMetadata, placeJsonLd } from "./seo";

describe("pageMetadata", () => {
  it("always carries the site-wide Open Graph fields and a canonical", () => {
    const m = pageMetadata({ title: "About", description: "Why.", path: "/about" });
    expect(m.title).toBe("About");
    expect(m.description).toBe("Why.");
    expect(m.alternates).toEqual({ canonical: "/about" });
    expect(m.openGraph).toMatchObject({ type: "website", siteName: SITE.name, locale: "en_US", url: "/about", title: "About", description: "Why." });
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });

  it("never sets images, so the opengraph-image file convention stays in charge", () => {
    const m = pageMetadata({ title: "x", description: "y", path: "/" });
    expect(m.openGraph).not.toHaveProperty("images");
    expect(m.twitter).not.toHaveProperty("images");
  });

  it("can opt out of the title template", () => {
    const m = pageMetadata({ title: `${SITE.name} · ${SITE.tagline}`, description: "d", path: "/", absolute: true });
    expect(m.title).toEqual({ absolute: `${SITE.name} · ${SITE.tagline}` });
  });
});

describe("absoluteUrl", () => {
  it("resolves paths against the site origin", () => {
    expect(absoluteUrl("/places/foo")).toBe(`${SITE.url}/places/foo`);
    expect(absoluteUrl("/")).toBe(`${SITE.url}/`);
  });
});

describe("openingHoursSpecification", () => {
  const edge = (day: number, time: string) => ({ day, time });
  const specs = (...periods: { open: ReturnType<typeof edge>; close?: ReturnType<typeof edge> }[]) =>
    openingHoursSpecification({ periods, weekdayText: [] }).map((s) => [s.dayOfWeek, s.opens, s.closes]);

  it("keeps a same-day period on one day", () => {
    expect(specs({ open: edge(2, "1100"), close: edge(2, "2130") })).toEqual([["Tuesday", "11:00", "21:30"]]);
  });

  it("keeps an overnight period on the day it opens", () => {
    expect(specs({ open: edge(5, "1600"), close: edge(6, "0100") })).toEqual([["Friday", "16:00", "01:00"]]);
    expect(specs({ open: edge(6, "1400"), close: edge(0, "0000") })).toEqual([["Saturday", "14:00", "00:00"]]);
  });

  it("splits a period longer than a day at midnight", () => {
    expect(specs({ open: edge(1, "1700"), close: edge(3, "0000") })).toEqual([
      ["Monday", "17:00", "23:59"],
      ["Tuesday", "00:00", "23:59"],
    ]);
    expect(specs({ open: edge(1, "1700"), close: edge(2, "1800") })).toEqual([
      ["Monday", "17:00", "23:59"],
      ["Tuesday", "00:00", "18:00"],
    ]);
  });

  it("reads a period with no close as open all week", () => {
    expect(specs({ open: edge(0, "0000") })).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => [d, "00:00", "23:59"]));
  });
});

describe("placeJsonLd", () => {
  const place: PublishedPlace = {
    id: "kona-club",
    name: "Kona Club",
    aliases: [],
    lat: 37.8,
    lng: -122.2,
    status: "open",
    hours: { periods: [{ open: { day: 2, time: "1100" }, close: { day: 2, time: "2130" } }], weekdayText: [] },
    tikiConfidence: 0.9,
    verified: true,
    sources: [],
  };

  it("gives an open place its hours and no status note", () => {
    const ld = placeJsonLd(place);
    expect(ld.description).toBeUndefined();
    expect(ld.additionalProperty.value).toBe("open");
    expect(ld.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Tuesday", opens: "11:00", closes: "21:30" }]);
  });

  it.each([
    ["closed", "Permanently closed."],
    ["temporarily_closed", "Temporarily closed."],
    ["coming_soon", "Coming soon; not open yet."],
    ["unverified", "Status unverified; it may not be open."],
  ] as const)("states %s and drops the hours", (status, note) => {
    const ld = placeJsonLd({ ...place, status });
    expect(ld.description).toBe(note);
    expect(ld.additionalProperty.value).toBe(status);
    expect(ld).not.toHaveProperty("openingHoursSpecification");
  });

  it("omits hours when an open place has none", () => {
    expect(placeJsonLd({ ...place, hours: undefined })).not.toHaveProperty("openingHoursSpecification");
  });
});
