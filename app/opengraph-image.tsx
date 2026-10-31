import { ImageResponse } from "next/og";
import { getSiteStats } from "@/lib/data/places";
import { C, Eyebrow, Frame, Torch, contentType as ogType, options, size as ogSize } from "@/lib/og/card";
import { pluralize } from "@/lib/og/text";
import { SITE } from "@/lib/seo";

export const alt = `${SITE.name} · ${SITE.tagline}`;
export const size = ogSize;
export const contentType = ogType;

export default async function Image() {
  const { places, countries } = getSiteStats();
  return new ImageResponse(
    <Frame footer={`${pluralize(places, "tiki bar")} · ${pluralize(countries, "country", "countries")}`}>
      <Eyebrow text="Open data · continuously verified" />
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <Torch size={150} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Fraunces, Geist, serif", fontSize: 136, letterSpacing: -4, lineHeight: 1 }}>{SITE.name}</span>
          <span style={{ fontSize: 42, color: C.muted, marginTop: 14 }}>{SITE.tagline}</span>
        </div>
      </div>
    </Frame>,
    options,
  );
}
