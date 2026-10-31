import { describe, expect, it } from "vitest";
import { SITE, absoluteUrl, pageMetadata } from "./seo";

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
    const m = pageMetadata({ title: "tiki.place · the open tiki bar atlas", description: "d", path: "/", absolute: true });
    expect(m.title).toEqual({ absolute: "tiki.place · the open tiki bar atlas" });
  });
});

describe("absoluteUrl", () => {
  it("resolves paths against the site origin", () => {
    expect(absoluteUrl("/places/foo")).toBe(`${SITE.url}/places/foo`);
    expect(absoluteUrl("/")).toBe(`${SITE.url}/`);
  });
});
