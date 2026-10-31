import { ImageResponse } from "next/og";
import { getSiteStats } from "@/lib/data/places";
import { C, Eyebrow, Frame, Torch, contentType as ogType, options, size as ogSize } from "@/lib/og/card";
import { pluralize } from "@/lib/og/text";
import { SITE } from "@/lib/seo";

export const alt = `${SITE.name} · ${SITE.tagline}`;
export const size = ogSize;
export const contentType = ogType;

/** The site name on two lines ("The World" / "Tiki Atlas"); the domain is the small wordmark in the Frame footer. */
const [nameTop, nameBottom] = (() => {
  const words = SITE.name.split(" ");
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
})();

export default async function Image() {
  const { places, countries } = getSiteStats();
  return new ImageResponse(
    <Frame footer={`${pluralize(places, "tiki bar")} · ${pluralize(countries, "country", "countries")}`}>
      <Eyebrow text="Open data · continuously verified" />
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <Torch size={170} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Fraunces, Geist, serif", fontSize: 112, letterSpacing: -3, lineHeight: 0.98 }}>{nameTop}</span>
          <span style={{ fontFamily: "Fraunces, Geist, serif", fontSize: 112, letterSpacing: -3, lineHeight: 0.98 }}>{nameBottom}</span>
          <span style={{ fontSize: 36, color: C.muted, marginTop: 18 }}>{SITE.tagline}</span>
        </div>
      </div>
    </Frame>,
    options,
  );
}
