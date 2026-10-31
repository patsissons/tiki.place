import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { cityOf, getCountryParams, getCountryPlaces } from "@/lib/data/places";
import { Eyebrow, Frame, Headline, Line, contentType as ogType, options, size as ogSize } from "@/lib/og/card";
import { pluralize } from "@/lib/og/text";
import { countryName } from "@/lib/utils";

export const dynamicParams = false;
export const generateStaticParams = () => getCountryParams();

export const alt = "Tiki bars by country on tiki.place";
export const size = ogSize;
export const contentType = ogType;

export default async function Image({ params }: { params: Promise<{ cc: string }> }) {
  const cc = (await params).cc.toUpperCase();
  const places = getCountryPlaces(cc);
  if (places.length === 0) notFound();
  const cities = new Set(places.map(cityOf).filter(Boolean)).size;
  return new ImageResponse(
    <Frame>
      <Eyebrow text="Tiki bars in" />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Headline text={countryName(cc) ?? cc} />
        <Line items={[pluralize(places.length, "verified place"), pluralize(cities, "city", "cities")]} size={34} />
      </div>
    </Frame>,
    options,
  );
}
