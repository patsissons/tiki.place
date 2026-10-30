import type { Metadata } from "next";
import { getAllPlaces, getSources, getSyncState } from "@/lib/data/places";
import { isPublished } from "@/lib/schema";
import { relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Sources", description: "Where tiki.place data comes from, how fresh it is, and under what licenses." };

export default function SourcesPage() {
  const sources = getSources();
  const state = getSyncState();
  const places = getAllPlaces();
  const published = places.filter(isPublished);
  const perSource = new Map<string, { places: number; published: number }>();
  for (const p of places) {
    for (const s of new Set(p.sources.map((x) => x.sourceId))) {
      const e = perSource.get(s) ?? { places: 0, published: 0 };
      e.places++;
      if (isPublished(p)) e.published++;
      perSource.set(s, e);
    }
  }
  const lastRun = state.runs[0];
  const verifiedRecently = countVerifiedRecently(published);
  const needsReview = places.filter((p) => p.review.state === "needs_review").length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Sources</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">
        Every place on tiki.place is assembled from public sources, each field tagged with where it came from. A scheduled job re-reads the sources and re-verifies places against Google within a fixed budget. People make the judgment calls; the job only replays them.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Published places" value={published.length} />
        <Stat label="Verified in last 45 days" value={verifiedRecently} />
        <Stat label="Candidates awaiting review" value={needsReview} />
        <Stat label="Last sync" value={lastRun ? relativeDays(lastRun.at) : "never"} />
      </dl>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Places</th>
              <th className="py-2 pr-4">Last read</th>
              <th className="py-2">License</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sources.map((s) => {
              const st = state.sources[s.id];
              const n = perSource.get(s.id);
              return (
                <tr key={s.id} className="align-top">
                  <td className="py-3 pr-4">
                    <a href={s.homepage} className="font-medium text-seaglass hover:underline" target="_blank" rel="noopener noreferrer">{s.name}</a>
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{s.adapter === "google" ? "verification" : `discovery, ${s.schedule.discovery}`}</td>
                  <td className="py-3 pr-4">
                    <span className={s.status === "active" ? "text-amber" : "text-fg-muted"}>{s.status}</span>
                    {st?.lastStatus === "error" && <span className="ml-2 text-coral">last run failed</span>}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{n ? `${n.published} / ${n.places}` : "0"}</td>
                  <td className="py-3 pr-4 text-fg-muted">{st?.lastRunAt ? relativeDays(st.lastRunAt) : "—"}</td>
                  <td className="py-3 text-fg-muted">
                    {s.license.url ? (
                      <a href={s.license.url} className="hover:underline" target="_blank" rel="noopener noreferrer">{s.license.name}</a>
                    ) : (
                      s.license.name
                    )}
                    <div className="text-xs">{s.license.attribution}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-12 max-w-2xl space-y-3 text-sm text-fg-muted">
        <h2 className="font-display text-xl font-semibold text-fg">What we store</h2>
        <p>Names, addresses, coordinates, websites, phone numbers, opening hours, open/closed status, and the year a bar opened. We link to each source and never copy its descriptions, photos or reviews.</p>
        <h2 className="font-display text-xl font-semibold text-fg">Corrections</h2>
        <p>If something is wrong or missing, <a className="text-seaglass hover:underline" href="/submit">tell us</a>. Reports become observations in the same pipeline and are reviewed by a person.</p>
      </section>
    </main>
  );
}

function countVerifiedRecently(published: { lastVerifiedAt?: string }[]) {
  const cutoff = Date.now() - 45 * 86_400_000;
  return published.filter((p) => p.lastVerifiedAt && Date.parse(p.lastVerifiedAt) > cutoff).length;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/60 p-4">
      <dt className="text-xs uppercase tracking-wider text-fg-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</dd>
    </div>
  );
}
