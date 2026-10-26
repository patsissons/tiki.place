import { relativeDays } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  google: "Google Places",
  tikirat: "Tiki Rat",
  osm: "OpenStreetMap",
  overture: "Overture Maps",
  tikiwanderlust: "Tiki Wanderlust",
  "user-submission": "a reader",
};

export function SourcesFooter({ sources, lastVerifiedAt, className }: { sources: { id: string; url?: string }[]; lastVerifiedAt?: string; className?: string }) {
  const listed = sources.filter((s) => s.id !== "google");
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Where this comes from</h3>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {listed.map((s) => (
          <li key={`${s.id}:${s.url ?? ""}`}>
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
