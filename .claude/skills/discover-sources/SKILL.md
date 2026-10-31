---
name: discover-sources
description: Find, evaluate, add or retire tiki place data sources and triage the review queue. Use when asked to add a source, backfill places, review candidates, fix a failing source, or clean up the dataset.
---

# Discover sources

You are the human-in-the-loop half of tiki.place's data system. The daily GitHub Action (`.github/workflows/sync.yml`) is deterministic and makes no judgment calls; every judgment is recorded here as data so the sync can replay it.

## Ground rules

- The database is `data/`. Never hand-edit `data/places/*.json`; the next sync would revert you. Record judgments with `pnpm review …` (they append to `data/decisions.yml`).
- Sources are facts-only. Store names, addresses, coordinates, contact details, status and dates. Never store a source's editorial text, photos or reviews. Every place links back to the sources it came from.
- Be polite to every site: check `robots.txt` and terms, keep `politeness.minIntervalMs >= 2000`, prefer sitemaps, feeds and open datasets over page crawls. tikirat.com is run by a friend of the project: the daily sync makes one sitemap request per run, and the owner agreed to a slow, attributed pull, so bar pages are refreshed only by hand with `pnpm sync snapshot-tikirat` (3 s apart, never from CI).
- Prefer open datasets (Overture, OpenStreetMap) and tiki-specific directories. Google is the verifier, never a crawler; it has a budget ledger in `data/ledger/google.json`. Check the ledger and ask the owner before any agent-run spend, and use `--skip-verify` otherwise. `--force` bypasses the circuit breaker but not the daily caps.

## Orientation

```
pnpm source list            # every source, status, last run, errors
pnpm review list            # candidates needing review, best first
cat data/sync-state.json    # last 30 run summaries
```

## Add a source

1. Evaluate: what does it list, how is it accessed (sitemap, HTML list, JSON, parquet), what are its terms, how tiki-specific is it (`tikiSignal`), how trustworthy are its facts (`trust`)? Record the answers in the source's `notes`.
2. Scaffold: `pnpm source add --id <slug> --adapter <adapter> --homepage <url> --name "<name>" --trust 0.6 --tiki-signal 0.8 --discovery weekly`. Reuse an existing adapter when the shape matches; otherwise add `sync/adapters/<adapter>.ts`, register it in `sync/adapters/index.ts`, and add the id to `AdapterIdSchema` in `lib/schema/common.ts`.
3. Capture fixtures with the polite fetcher, one per structural variant: `pnpm sync fetch <url> --save sync/__fixtures__/<id>/<name>.html`. Write the parser against the fixture and a test in `sync/__tests__/<id>.test.ts` asserting the exact observations.
4. Dry run: `pnpm sync run --source <id> --dry-run --skip-verify`. Read the report: new places, matches, warnings. Fix name normalization or address parsing before it creates junk.
5. Real run: `pnpm sync run --source <id> --skip-verify` (add `--force` for a first backfill over 200 places). Then `pnpm validate && pnpm test`.
6. Commit adapter code and the new source on a branch and open a PR. Data files can go in the same PR.

## Triage the review queue

```
pnpm review list [--source id] [--min-confidence 0.5]
pnpm review show <slug>            # place + every observation + a Maps link
pnpm review approve <slug>
pnpm review reject <slug> --reason "not a bar"
pnpm review merge <dup-slug> --into <slug>
pnpm review link <sourceId:ref> --to <slug>     # force a source record onto a place
pnpm review resolve <slug> --google <placeId>   # attach a Google Place ID you looked up
pnpm review pin <slug> name '"Correct Name"'
pnpm review batch <file.yml>       # many decisions, one replay, recorded as by: skill
```

Each command records the decision and replays the engine offline, so you see the effect immediately. A later approve or reject replaces an earlier one; deleting a decision does not undo it, because the state is saved on the place. Approve when the place is a real tiki bar, lounge or restaurant with a tiki program. Reject car washes, ice cream shops, closed-for-decades spots and unrelated "Tiki" businesses, with a short reason. Merge duplicates into the slug with the better name. Weak Google matches (`reason: weak google match`) need a look at the Maps link before approving.

The owner's rule for what counts as tiki:

- A bar is a tiki bar when its menu has at least 3 tiki drinks and at least 1 of them is a Mai Tai, Zombie or Painkiller. "Tiki" in the name or a bar's own description is not enough.
- Tiki drinks include the classics (Navy Grog, Jungle Bird, Scorpion, Fog Cutter, Saturn and so on) and the tropical standards (Piña Colada, Hurricane, Bahama Mama, Rum Runner, Blue Hawaiian, Planter's Punch). A drink used only as an ingredient, or a variant like a Mai Tai Mule, does not count.
- A tiki-adjacent bar (Tiki Rat marks these) counts only with a dedicated tiki room or tiki menu.
- A place stays queued until someone has read its menu. Reject on the menu only when the page read is its actual drink list and that list falls short.
- Read the list before rejecting. Name matching undercounts, because bars rename classics and some PDFs extract with broken spacing.

Gather evidence without spending the Google budget: one paced request to a place's own site, then Google Maps pages in Claude in Chrome (four lookups per `browser_batch`, 14 s or more apart). Use what you see for the judgment only; never copy it into the dataset. Stop at any bot challenge and never solve one; DuckDuckGo's HTML endpoint challenged on the second search. Check old websites before approving, because some now serve spam.

## Manual sources

Tiki Wanderlust sits behind a Cloudflare challenge in CI, so its source has `discovery: manual`. Never try to defeat the challenge from automation. Places only manual sources list carry `syncPolicy: manual`, and the daily sync spends no Google budget on them. To refresh at a long interval:

1. Open https://tikiwanderlust.com/master-list/ in a real browser (if a challenge appears, the owner clears it) and save the page text over `data/snapshots/tikiwanderlust.txt`.
2. `pnpm sync run --source tikiwanderlust --skip-verify`, then `pnpm validate`.
3. Only when there is budget to spare: `pnpm sync run --include-manual` to resolve those places, within the normal daily caps.

## Retire or pause a source

`pnpm source retire <id> --reason "..."` keeps its observations and provenance; `pause`/`resume` toggle it. Explain why in the commit message.

## When the daily sync fails

Read the `sync-failure` issue and the run summary. Common causes: a source changed its HTML (update fixture + parser), the circuit breaker tripped (inspect the report; re-dispatch with `force=true` only if the change is real), Google quota (check the ledger). Fix forward on a branch.
