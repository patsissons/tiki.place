import type { StatusValue } from "./schema/common";
import type { PublishedPlace } from "./schema/published";
import { SITE, absoluteUrl } from "./seo";

/** Typed against the schema, so adding a published field or status fails the typecheck until it is documented here. */
const FIELDS: Record<keyof PublishedPlace, string> = {
  id: "Stable slug; the place page is /places/{id}.",
  name: "Display name.",
  aliases: "Other names the sources use.",
  lat: "Latitude.",
  lng: "Longitude.",
  locality: "City, when known.",
  region: "State or region, when known.",
  country: "ISO 3166-1 alpha-2 code, when known.",
  formattedAddress: "Full street address, when known.",
  timezone: "IANA time zone of the venue; hours are in this zone.",
  status: "Operating status; see Status below.",
  hours: "Weekly hours, when known: periods[] of { open, close } and weekdayText[]. day 0 is Sunday, time is local HHMM, and a period with no close runs continuously.",
  website: "Venue website.",
  phone: "Venue phone number.",
  googleMapsUri: "Google Maps link.",
  rating: "Google rating out of 5.",
  ratingCount: "Number of Google ratings.",
  priceLevel: "Price level from $ upward.",
  established: "Year opened.",
  tikiConfidence: "0 to 1: how strongly the sources signal that this is a tiki bar.",
  verified: "Whether the place has been checked against Google Places.",
  lastVerifiedAt: "ISO 8601 time of the latest check.",
  sources: "Where the record comes from: [{ id, url }]. Each source is described at /sources.",
};

const STATUSES: Record<StatusValue, string> = {
  open: "Operating. This does not mean open right now; work that out from hours and timezone.",
  temporarily_closed: "Closed for now.",
  closed: "Permanently closed. Kept for the record; do not recommend it as somewhere to go.",
  coming_soon: "Announced but not open yet.",
  unverified: "Listed by a source but not confirmed to be operating.",
};

const bullets = (entries: Record<string, string>) => Object.entries(entries).map(([key, text]) => `- \`${key}\`: ${text}`);

export function llmsTxt(count: number): string {
  return [
    `# ${SITE.name} (${SITE.domain})`,
    "",
    `> ${SITE.description} ${count} places are published.`,
    "",
    "For anything about the data, download places.json and filter it. It is one small file and needs no key. The home page and its `?q=` search run in the browser, so their HTML contains no places.",
    "",
    "## Data",
    "",
    `- [Every place as JSON](${absoluteUrl("/data/places.json")}): an array of the records described under Place fields.`,
    `- [Every place as GeoJSON](${absoluteUrl("/data/places.geojson")}): points with only id, name, status, locality and country.`,
    `- [Manifest](${absoluteUrl("/data/manifest.json")}): the count, places per country, and a hash that changes with the data.`,
    "",
    "## Pages",
    "",
    `- Place: ${SITE.url}/places/{id} is server-rendered with schema.org JSON-LD (BarOrPub) that includes status and hours.`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")}): every place, city and country page.`,
    `- [Sources](${absoluteUrl("/sources")}): each source's license and required attribution, and how fresh it is.`,
    `- [About](${absoluteUrl("/about")}): what the project is and how it stays accurate.`,
    "",
    "## Place fields",
    "",
    "Optional fields are left out when unknown.",
    "",
    ...bullets(FIELDS),
    "",
    "## Status",
    "",
    "The dataset includes places that are not operating, so check `status` before recommending one.",
    "",
    ...bullets(STATUSES),
    "",
    "## Corrections",
    "",
    `People can report a missing or wrong place with the [form](${absoluteUrl("/submit")}). A person reviews every report.`,
    "",
  ].join("\n");
}
