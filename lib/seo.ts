import type { Metadata } from "next";
import { periodRange } from "./hours";
import type { Hours, HoursPeriod, StatusValue } from "./schema/common";
import type { PublishedPlace } from "./schema/published";

/** Site identity shared by metadata, robots, the sitemap, JSON-LD and the social cards. */
export const SITE = {
  name: "tiki.place",
  tagline: "the open tiki bar atlas",
  description: "An open, continuously verified atlas of tiki bars around the world.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://tiki.place",
} as const;

/** Absolute URL for things outside the Metadata API (JSON-LD, feeds). */
export const absoluteUrl = (path: string): string => new URL(path, SITE.url).toString();

export type PageMeta = {
  /** Page title. Templated as "<title> · tiki.place" unless `absolute` is set. */
  title: string;
  description: string;
  /** Canonical path, e.g. "/" or "/places/smugglers-cove-san-francisco". */
  path: string;
  /** Use the title verbatim (home page). */
  absolute?: boolean;
};

/**
 * Builds title, description, canonical and a complete Open Graph object for a page.
 *
 * Next shallow-merges `openGraph`, so a page that sets any of it replaces the root layout's object
 * wholesale; routing every page through here keeps `siteName`, `type` and `url` present.
 * `openGraph.images` is deliberately never set: the `opengraph-image.tsx` file convention supplies it
 * and is skipped at any level that sets images explicitly. Twitter title, description and image are
 * inherited from Open Graph by Next.
 */
export function pageMetadata({ title, description, path, absolute = false }: PageMeta): Metadata {
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    // Open Graph gets the bare title: networks already show the site name next to the card.
    openGraph: { type: "website", siteName: SITE.name, locale: "en_US", url: path, title, description },
    twitter: { card: "summary_large_image" },
  };
}

const DAY_MIN = 1440;
const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function periodSpecs({ start, end }: { start: number; end: number }) {
  const spec = (at: number, closes: number) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: SCHEMA_DAYS[Math.floor(at / DAY_MIN) % 7],
    opens: clock(at % DAY_MIN),
    closes: clock(closes),
  });
  // Under a day, including past midnight: schema.org reads a closes earlier than opens as the next morning.
  if (end - start < DAY_MIN) return [spec(start, end % DAY_MIN)];
  // Longer runs split at midnight, and 23:59 is the schema.org convention for "until the end of the day".
  const specs = [];
  for (let at = start; at < end; at = (Math.floor(at / DAY_MIN) + 1) * DAY_MIN) {
    const dayEnd = (Math.floor(at / DAY_MIN) + 1) * DAY_MIN;
    specs.push(spec(at, end >= dayEnd ? DAY_MIN - 1 : end % DAY_MIN));
  }
  return specs;
}

export const openingHoursSpecification = (hours: Hours) => hours.periods.flatMap((p: HoursPeriod) => periodSpecs(periodRange(p)));

/** schema.org has no closed state for a business, so anything but open is spelled out for readers of the JSON-LD alone. */
const STATUS_NOTE: Partial<Record<StatusValue, string>> = {
  closed: "Permanently closed.",
  temporarily_closed: "Temporarily closed.",
  coming_soon: "Coming soon; not open yet.",
  unverified: "Status unverified; it may not be open.",
};

export function placeJsonLd(p: PublishedPlace) {
  return {
    "@context": "https://schema.org",
    "@type": "BarOrPub",
    name: p.name,
    url: absoluteUrl(`/places/${p.id}`),
    description: STATUS_NOTE[p.status],
    address: p.formattedAddress,
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    telephone: p.phone,
    sameAs: [p.website, p.googleMapsUri].filter(Boolean),
    additionalProperty: { "@type": "PropertyValue", name: "status", value: p.status },
    // Hours only describe a venue that is operating; on any other status they would read as open.
    ...(p.status === "open" && p.hours?.periods.length ? { openingHoursSpecification: openingHoursSpecification(p.hours) } : {}),
    ...(p.rating !== undefined && p.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.ratingCount } } : {}),
  };
}
