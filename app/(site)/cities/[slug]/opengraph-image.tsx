import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getCityParams, getCityPlaces } from "@/lib/data/places";
import { Eyebrow, Frame, Headline, Line, contentType as ogType, options, size as ogSize } from "@/lib/og/card";
import { pluralize } from "@/lib/og/text";
import { countryName } from "@/lib/utils";

export const dynamicParams = false;
export const generateStaticParams = () => getCityParams();

export const alt = "Tiki bars by city on tiki.place";
export const size = ogSize;
export const contentType = ogType;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const places = getCityPlaces(slug);
  const first = places[0];
  if (!first) notFound();
  const where = [first.address.locality, first.address.region].filter(Boolean).join(", ");
  return new ImageResponse(
    <Frame footer={countryName(first.address.country)}>
      <Eyebrow text="Tiki bars in" />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Headline text={where} />
        <Line items={[pluralize(places.length, "verified place"), countryName(first.address.country)]} size={34} />
      </div>
    </Frame>,
    options,
  );
}
