import { relativeDays } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  google: "Google Places",
  tikirat: "Tiki Rat",
  osm: "OpenStreetMap",
  overture: "Overture Maps",
  tikiwanderlust: "Tiki Wanderlust",
  tikiatlas: "The Tiki Atlas",
  mytiki: "mytiki.life",
  allthetikibars: "the All The Tiki Bars map",
  "user-submission": "a reader",
};

export function SourcesFooter({ sources, lastVerifiedAt, className }: { sources: { id: string; url?: string }[]; lastVerifiedAt?: string; className?: string }) {
  // One link per source: a directory may list a place twice (an atlas's curated entry and its map import),
  // and list-style sources (a map, a master list) share one URL across records.
  const seen = new Set<string>();
  const listed = sources.filter((s) => {
    if (s.id === "google" || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Where this comes from</h3>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {listed.map((s) => (
          <li key={s.id}>
            {s.url ? (
              <a className="text-seaglass hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">
                Listed on {SOURCE_LABEL[s.id] ?? s.id} ↗
              </a>
            ) : (
              <span className="text-fg-muted">Listed on {SOURCE_LABEL[s.id] ?? s.id}</span>
            )}
          </li>
        ))}
        <li className="text-fg-muted">{lastVerifiedAt ? `Verified with Google ${relativeDays(lastVerifiedAt)}` : "Not yet verified with Google"}</li>
      </ul>
    </div>
  );
}
