import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPlace, getPublishedPlaces } from "@/lib/data/places";
import { toPublished } from "@/lib/data/published";
import { Chip, Facts, Frame, Headline, Line, contentType as ogType, options, size as ogSize } from "@/lib/og/card";
import { STATUS_TEXT, placeFacts, verifiedLine } from "@/lib/og/text";
import { isPublished } from "@/lib/schema";
import { placeLocation } from "@/lib/utils";

// Image routes do not inherit the page's static params, so they are declared here as well.
export const dynamicParams = false;
export const generateStaticParams = () => getPublishedPlaces().map((p) => ({ slug: p.id }));

export const alt = "Tiki bar card from tiki.place";
export const size = ogSize;
export const contentType = ogType;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place || !isPublished(place)) notFound();
  const p = toPublished(place);
  const status = STATUS_TEXT[p.status];
  return new ImageResponse(
    <Frame footer={verifiedLine(p.lastVerifiedAt)}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Chip label={status.label} color={status.color} />
        <Facts items={placeFacts(p)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Headline text={p.name} />
        <Line items={[placeLocation(p, { countryAsName: true })]} size={34} />
      </div>
    </Frame>,
    options,
  );
}
