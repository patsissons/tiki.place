import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export function countryName(code?: string): string | undefined {
  if (!code) return undefined;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function placeLocation(p: { locality?: string; region?: string; country?: string }, opts: { countryAsName?: boolean } = {}): string {
  const country = opts.countryAsName ? countryName(p.country) : p.country;
  // City-states and some non-Latin records repeat the locality as the region ("Dubai, Dubai").
  const region = p.region && p.region !== p.locality ? p.region : undefined;
  return [p.locality, region, country].filter(Boolean).join(", ");
}

export function citySlug(p: { locality?: string; region?: string; country?: string }): string | null {
  if (!p.locality || !p.country) return null;
  return [p.locality, p.region, p.country]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function relativeDays(iso?: string, now = Date.now()): string {
  if (!iso) return "never";
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
