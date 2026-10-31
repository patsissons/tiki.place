import Link from "next/link";

import { SITE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "About", description: `Why ${SITE.name} exists and how it stays accurate.`, path: "/about" });

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">About</h1>
      <div className="mt-6 space-y-5 leading-relaxed text-fg/90">
        <p>
          {SITE.name} is an open atlas of tiki bars: the escapist, rum-soaked lounges that started with Don the Beachcomber in 1933 and keep reappearing in
          basements, strip malls and hotel lobbies around the world. Directories of them tend to go stale or disappear. This one, at {SITE.domain}, is built
          to keep itself honest.
        </p>
        <p>
          The whole database lives in a public Git repository as plain files. A scheduled job re-reads every source, merges what they say, and verifies
          each place against Google Places on a rolling schedule. When sources disagree, the most reliable one wins and the others are kept as aliases.
          When a person makes a judgment call, it is recorded as data so the job can replay it forever.
        </p>
        <p>
          We index facts and link back. Names, addresses, coordinates, hours and status, with the source of each shown on every page. Editorial writing,
          photos and reviews stay with the people who made them. See the <Link href="/sources" className="text-seaglass hover:underline">sources page</Link> for
          licenses and freshness.
        </p>
        <p>
          Every published place is free to download, with no key, as <a href="/data/places.json" className="text-seaglass hover:underline">JSON</a> or{" "}
          <a href="/data/places.geojson" className="text-seaglass hover:underline">GeoJSON</a>. AI agents and scripts can start with{" "}
          <a href="/llms.txt" className="text-seaglass hover:underline">llms.txt</a>, which explains the fields.
        </p>
        <p>
          The sky behind the globe is real. Stars come from the Yale Bright Star Catalog, the Milky Way from{" "}
          <a href="https://svs.gsfc.nasa.gov/4851" className="text-seaglass hover:underline">NASA&apos;s Deep Star Maps 2020</a>, and the Sun, Moon and planets sit
          where they actually are, lit as they actually are, computed with{" "}
          <a href="https://github.com/cosinekitty/astronomy" className="text-seaglass hover:underline">astronomy-engine</a>. Only the orbital clock is sped up,
          and the options on the map can run it in real time or turn the sky off. The Moon texture is by{" "}
          <a href="https://www.solarsystemscope.com/textures/" className="text-seaglass hover:underline">Solar System Scope</a> (CC BY 4.0).
        </p>
        <p>
          The music on the map is original, written for this atlas: a synth loop for space that crossfades into an aloha loop as you zoom in. The speaker button
          on the map turns it off. It is built with the Fluid R3 SoundFont and the Versilian Community Sample Library; see the{" "}
          <a href="/music/CREDITS.txt" className="text-seaglass hover:underline">music credits</a>.
        </p>
        <p>
          Know a bar that is missing, or one that has closed? <Link href="/submit" className="text-seaglass hover:underline">Suggest a correction</Link>. The code
          and data are on <a href="https://github.com/patsissons/tiki.place" className="text-seaglass hover:underline">GitHub</a>.
        </p>
      </div>
    </main>
  );
}
