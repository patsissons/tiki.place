import { getPublishedPlaces } from "@/lib/data/places";

export default function HomePage() {
  const places = getPublishedPlaces();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">tiki.place</h1>
      <p className="mt-2 text-fg-muted">
        {places.length} verified tiki places. The new atlas is being rebuilt; the map returns soon.
      </p>
      <ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-bg-elevated">
        {places.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="font-medium">{p.name}</span>
            <span className="text-sm text-fg-muted">
              {[p.address.locality, p.address.region, p.address.country].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
