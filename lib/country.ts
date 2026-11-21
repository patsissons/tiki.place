/**
 * Country name -> ISO 3166-1 alpha-2, for sources that write countries as names,
 * often in the local language ("España", "日本", "Schweiz/Suisse/Svizzera/Svizra").
 */

const LOCALES = ["en", "es", "fr", "de", "it", "pt", "nl", "sv", "nb", "da", "fi", "pl", "cs", "hu", "el", "ru", "ja", "ko", "zh-Hans", "zh-Hant", "th", "ar", "tr", "id", "vi"];

/** Names Intl does not produce but sources use (OSM-style local names, short forms). */
const ALIASES: Record<string, string> = {
  usa: "US",
  "hong kong": "HK",
  macau: "MO",
  macao: "MO",
  "united states of america": "US",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "great britain": "GB",
  ελλάς: "GR",
  belau: "PW",
  臺灣: "TW",
  ประเทศไทย: "TH",
  micronesia: "FM",
  russia: "RU",
  "south korea": "KR",
  korea: "KR",
  "czech republic": "CZ",
  holland: "NL",
  "the netherlands": "NL",
  "the bahamas": "BS",
  "u.s. virgin islands": "VI",
  "us virgin islands": "VI",
  "viet nam": "VN",
  turkey: "TR",
  türkiye: "TR",
};

let byName: Map<string, string> | null = null;

function table(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  const codes: string[] = [];
  // Skip withdrawn and reserved codes ("DD" East Germany also displays as "Deutschland" in some locales).
  const skip = /^(AA|AN|BU|CS|DD|EU|EZ|FX|NT|QM|Q[N-Z]|SU|TP|UN|X[A-Z]|YU|ZR|ZZ)$/;
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (!skip.test(code)) codes.push(code);
  }
  for (const locale of LOCALES) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      continue;
    }
    for (const code of codes) {
      const name = names.of(code);
      if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), code);
    }
  }
  for (const [name, code] of Object.entries(ALIASES)) byName.set(name, code);
  return byName;
}

/** "US", "United States", "España", "Schweiz/Suisse/Svizzera/Svizra" -> ISO-2, or undefined. */
export function countryToIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const t = table();
  const direct = t.get(v.toLowerCase());
  if (direct) return direct;
  // Multilingual names: "België / Belgique / Belgien"
  for (const part of v.split("/")) {
    const hit = t.get(part.trim().toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}
