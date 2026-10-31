import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { Explorer } from "@/components/explorer/explorer";
import { SiteHeader } from "@/components/site-header";
import { ManifestSchema } from "@/lib/schema/published";
import { SITE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: `${SITE.name} · ${SITE.tagline}`, absolute: true, description: SITE.description, path: "/" });

function readManifest() {
  try {
    return ManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "manifest.json"), "utf8")));
  } catch {
    return { version: 1 as const, hash: "dev", count: 0, countries: {} };
  }
}

export default function HomePage() {
  const manifest = readManifest();
  return (
    <Suspense
      fallback={
        <main className="relative h-dvh w-full bg-bg">
          <SiteHeader overlay />
        </main>
      }
    >
      <Explorer manifestHash={manifest.hash} total={manifest.count} />
    </Suspense>
  );
}
