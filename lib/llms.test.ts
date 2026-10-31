import { describe, expect, it } from "vitest";
import { StatusValueSchema } from "./schema/common";
import { PublishedPlaceSchema } from "./schema/published";
import { llmsTxt } from "./llms";
import { SITE } from "./seo";

describe("llmsTxt", () => {
  const text = llmsTxt(567);

  it("opens with the llms.txt title and summary", () => {
    expect(text.startsWith(`# ${SITE.name} (${SITE.domain})\n\n> ${SITE.description} 567 places are published.\n`)).toBe(true);
  });

  it("links the dataset by absolute URL", () => {
    expect(text).toContain(`(${SITE.url}/data/places.json)`);
    expect(text).toContain(`(${SITE.url}/data/places.geojson)`);
    expect(text).toContain(`(${SITE.url}/data/manifest.json)`);
  });

  it("keeps the place URL template readable", () => {
    expect(text).toContain(`${SITE.url}/places/{id} `);
  });

  it("documents every published field and status", () => {
    for (const field of Object.keys(PublishedPlaceSchema.shape)) expect(text).toContain(`- \`${field}\`:`);
    for (const status of StatusValueSchema.options) expect(text).toContain(`- \`${status}\`:`);
  });
});
