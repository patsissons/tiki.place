import type { Metadata } from "next";

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
