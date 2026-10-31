import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 py-8 text-sm text-fg-muted sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-md">
          An open, continuously verified atlas of tiki bars. Facts are indexed from public sources with attribution; the data is{" "}
          <a className="text-seaglass hover:underline" href="https://github.com/patsissons/tiki.place">
            on GitHub
          </a>
          .
        </p>
        <p className="max-w-md text-xs leading-relaxed">
          Map data © <a className="hover:underline" href="https://www.mapbox.com/about/maps/">Mapbox</a> and{" "}
          <a className="hover:underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Place data includes{" "}
          <a className="hover:underline" href="https://overturemaps.org">Overture Maps</a> (CDLA-Permissive 2.0),{" "}
          <a className="hover:underline" href="https://tikirat.com">Tiki Rat</a> listings, and Google Places verification. See{" "}
          <Link className="text-seaglass hover:underline" href="/sources">
            sources
          </Link>
          . Sky behind the globe: <a className="hover:underline" href="https://svs.gsfc.nasa.gov/4851">NASA/Goddard SVS Deep Star Maps 2020</a> (Ernie
          Wright), the <a className="hover:underline" href="http://tdc-www.harvard.edu/catalogs/bsc5.html">Yale Bright Star Catalog</a>, Moon texture by{" "}
          <a className="hover:underline" href="https://www.solarsystemscope.com/textures/">Solar System Scope</a> (CC BY 4.0), positions by{" "}
          <a className="hover:underline" href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>.
        </p>
      </div>
    </footer>
  );
}
