# tiki.place

An open, continuously verified atlas of tiki bars. The database lives in this repository as plain JSON and YAML; a daily GitHub Action keeps it fresh; the Next.js site renders it.

## How the data works

```
data/sources/*.yml          what we read and how politely
data/snapshots/*            hand-refreshed source captures, facts only (Tiki Rat, Tiki Wanderlust)
data/observations/*.jsonl   what each source said (normalized, one line per record)
data/places/*.json          canonical places with per-field provenance
data/decisions.yml          owner judgments, replayed on every sync
data/ledger/google.json     Google Places API budget
```

Two tiers:

- **Discovery (manual, agentic).** A Claude Code session using `.claude/skills/discover-sources` finds and evaluates sources, writes adapters against fixtures, runs dry runs, and triages the review queue with `pnpm review`. Its output is code plus decision data, never hand-edited place files.
- **Sync (scheduled, deterministic).** `.github/workflows/sync.yml` runs `pnpm sync run` daily: re-read due sources, resolve observations to places, merge by precedence, replay decisions, score tiki confidence, derive status, spend the Google budget on resolution and verification, validate, commit.

Sources today: Google Places (verifier), Tiki Rat (directory, attribution; daily sitemap plus a slow, hand-run page snapshot, with the owner's permission), OpenStreetMap (Overpass, weekly), Overture Maps (monthly DuckDB snapshot), reader submissions (GitHub issues filed from `/submit`) and Tiki Wanderlust (manual). Tiki Wanderlust challenges automated clients, so it is refreshed by hand at long intervals; places only it lists carry `syncPolicy: manual`, and the daily sync spends no Google budget on them.

Google spend is capped per day and per month, and `pausedUntil` in `data/sources/google.yml` stops it entirely until a date. `--force` bypasses the circuit breaker, not those caps. Enterprise refreshes go only to published places, every 30 days.

## Commands

```
pnpm dev                     # site
pnpm sync run [--source id] [--dry-run] [--offline] [--skip-verify] [--force] [--include-manual]
pnpm sync snapshot-tikirat [--limit n] [--refresh-days n]   # by hand, 3 s between pages
pnpm review list|show|approve|reject|merge|link|pin|resolve
pnpm source list|add|pause|resume|retire
pnpm validate                # every data file parses, invariants hold, canonical form
pnpm data:build              # public/data/{places.json,places.geojson,manifest.json}
pnpm space:build             # public/space/* sky assets and assets/og/sky.jpg (by hand; downloads ~40 MB of sources into .cache)
pnpm check                   # lint + typecheck + test + validate
```

Social cards (`opengraph-image.tsx` next to the home, place, city and country routes) are rendered at build time with
`next/og` from `assets/og/`: a crop of the NASA Milky Way map plus Fraunces and Instrument Sans as static TTFs (SIL OFL, see
`assets/og/OFL.txt`). No photos, Mapbox or Google calls are involved.

Agents and scripts start at `/llms.txt` (`lib/llms.ts`), which points to the dataset and documents every field. Place pages also carry
schema.org JSON-LD with status and hours (`placeJsonLd` in `lib/seo.ts`).

## Setup

1. `cp .env.example .env.local` and fill in the Mapbox token (and the Google key if you will run sync locally).
2. `pnpm install`
3. `pnpm dev`

## Principles

- Facts only, with attribution. We store names, addresses, coordinates, contact details, hours and status, and link to where each came from. We never copy a source's editorial text.
- Polite by default: sitemaps and open data over crawling, conditional requests, per-host spacing, robots.txt.
- Nothing is published without a location and either corroboration or an owner decision. Owner decisions are final; automation never demotes.
