/**
 * The deterministic sync pipeline. No judgment lives here: sources are read,
 * observations resolved and merged, owner decisions replayed, Google spent within
 * budget, and the result validated before anything is written.
 */
import fs from "node:fs";
import path from "node:path";
import { placeSlug, uniqueSlug } from "@/lib/slug";
import {
  getRoot,
  deletePlace,
  readDecisions,
  readLedger,
  readObservations,
  readPlaces,
  readRedirects,
  readSources,
  readSyncState,
  serializePlace,
  writeLedger,
  writeObservations,
  writePlace,
  writeRedirects,
  writeSyncState,
} from "@/lib/data/store";
import {
  isPublished,
  observationKey,
  type Decision,
  type Observation,
  type Place,
  type RunSummary,
  type SkuCounts,
  type Source,
} from "@/lib/schema";
import { getAdapter } from "../adapters";
import { createGoogleClient, googleToObservation, pickCandidate, type GoogleClient } from "../adapters/google";
import type { Logger } from "../adapters/types";
import { WEAK_RESOLUTION_REASON, nextReviewState, tikiConfidence } from "./confidence";
import { createPoliteFetch, type PoliteFetch } from "./fetch";
import { latestPerKey, mergePlace, newPlaceSkeleton } from "./merge";
import { buildPublicData } from "./publish";
import { PlaceIndex, buildLinks, resolveObservation } from "./resolve";
import { GoogleBudget, planGoogleWork } from "./scheduler";
import { deriveStatus } from "./status";

export type EngineOptions = {
  /** Only run these sources' discovery (forces them even when not due). */
  sourceFilter?: string[];
  dryRun?: boolean;
  /** No network at all: replay committed observations. */
  offline?: boolean;
  skipVerify?: boolean;
  /** Bypass the circuit breaker and lift the text-search daily cap for a backfill. */
  force?: boolean;
  now?: Date;
  log?: Logger;
  googleApiKey?: string;
  /** Test seams. */
  googleClientFactory?: () => GoogleClient;
  fetchFactory?: (source: Source) => PoliteFetch;
};

export type EngineResult = { code: number; summary: RunSummary; report: string; tripped?: string };

const DAY = 86_400_000;
const CIRCUIT = { maxNewPlaces: 200, maxChangedFraction: 0.25, maxFlippedFraction: 0.05 };

const consoleLog: Logger = { info: (m) => console.log(m), warn: (m) => console.warn(`⚠ ${m}`) };

function isDue(discovery: Source["schedule"]["discovery"], lastAt: string | undefined, now: Date): boolean {
  if (discovery === "manual") return false;
  if (!lastAt) return true;
  const hours = (now.getTime() - Date.parse(lastAt)) / 3_600_000;
  return discovery === "daily" ? hours >= 20 : discovery === "weekly" ? hours >= 6.5 * 24 : hours >= 27 * 24;
}

/** Only sources that vouch for tiki-ness may create a candidate; name-only matches wait to corroborate. */
function canCreate(obs: Observation, source: Source): boolean {
  if (source.adapter === "google") return false;
  return obs.tags.includes("tiki-directory") || obs.tags.includes("tiki-category") || source.tikiSignal >= 0.8;
}

function applyDecisions(places: Map<string, Place>, decisions: Decision[], redirects: Record<string, string>, warnings: string[]) {
  const follow = (slug: string) => redirects[slug] ?? slug;
  for (const d of decisions) {
    switch (d.type) {
      case "approve":
      case "reject": {
        const p = places.get(follow(d.place));
        if (!p) break;
        const next = { state: d.type === "approve" ? ("approved" as const) : ("rejected" as const), by: "owner" as const, at: d.at, reason: d.type === "reject" ? d.reason : d.note };
        if (JSON.stringify(p.review) !== JSON.stringify(next)) p.review = next;
        break;
      }
      case "merge": {
        const from = places.get(d.from);
        const into = places.get(follow(d.into));
        if (!from || !into || from === into) break;
        for (const s of from.sources) if (!into.sources.some((x) => x.sourceId === s.sourceId && x.sourceRef === s.sourceRef)) into.sources.push(s);
        for (const [k, v] of Object.entries(from.externalIds)) if (!into.externalIds[k]) into.externalIds[k] = v;
        if (!into.aliases.includes(from.name) && from.name !== into.name) into.aliases.push(from.name);
        if (from.firstSeenAt < into.firstSeenAt) into.firstSeenAt = from.firstSeenAt;
        places.delete(from.id);
        redirects[from.id] = into.id;
        for (const [k, v] of Object.entries(redirects)) if (v === from.id) redirects[k] = into.id;
        break;
      }
      case "pin": {
        const p = places.get(follow(d.place));
        if (!p) break;
        const prov = { sourceId: "owner", observedAt: d.at };
        if (d.field === "name" && typeof d.value === "string") p.name = d.value;
        else if (d.field === "location" && d.value && typeof d.value === "object" && "lat" in d.value && "lng" in d.value) {
          const v = d.value as { lat: number; lng: number };
          p.location = { lat: v.lat, lng: v.lng, precision: "rooftop" };
        } else if (d.field === "address" && d.value && typeof d.value === "object") p.address = d.value as Place["address"];
        else if (d.field === "contact.website" && typeof d.value === "string") p.contact.website = d.value;
        else if (d.field === "contact.phone" && typeof d.value === "string") p.contact.phone = d.value;
        else if (d.field === "established" && typeof d.value === "number") p.established = d.value;
        else if (d.field === "timezone" && typeof d.value === "string") p.timezone = d.value;
        else {
          warnings.push(`pin on ${p.id}.${d.field} has an unusable value`);
          break;
        }
        p.provenance[d.field] = prov;
        break;
      }
      case "resolve": {
        const p = places.get(follow(d.place));
        if (!p) break;
        if (p.externalIds.google !== d.google) p.externalIds.google = d.google;
        delete p.resolution;
        if (p.review.reason === WEAK_RESOLUTION_REASON && p.review.by === "auto") p.review = { ...p.review, reason: undefined };
        break;
      }
      case "link":
        break; // consumed by resolution
    }
  }
}

export async function runEngine(opts: EngineOptions = {}): Promise<EngineResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const log = opts.log ?? consoleLog;
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    log.warn(m);
  };

  // ---- load ----
  const sources = readSources();
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const loaded = readPlaces();
  const original = new Map(loaded.map((p) => [p.id, serializePlace(p)]));
  const originallyPublished = new Set(loaded.filter(isPublished).map((p) => p.id));
  const decisions = readDecisions();
  const redirects = readRedirects();
  const ledger = readLedger();
  const state = readSyncState();
  const observations = new Map<string, Observation[]>();
  for (const s of sources) observations.set(s.id, readObservations(s.id));

  const placeMap = new Map(loaded.map((p) => [p.id, structuredClone(p)]));
  applyDecisions(placeMap, decisions, redirects, warnings);

  // ---- discovery ----
  const completeRefs = new Map<string, Set<string>>();
  const ranSources: string[] = [];
  for (const source of sources) {
    if (source.adapter === "google" || source.status !== "active") continue;
    const forced = opts.sourceFilter?.includes(source.id) ?? false;
    if (opts.sourceFilter && !forced) continue;
    const sourceState = state.sources[source.id] ?? { observationCount: 0, requestCount: 0 };
    if (opts.offline || (!forced && !isDue(source.schedule.discovery, sourceState.lastDiscoveryAt, now))) {
      log.info(`· ${source.id}: not due, using committed observations`);
      continue;
    }
    const prior = observations.get(source.id) ?? [];
    try {
      const adapter = getAdapter(source.adapter);
      const fetch =
        opts.fetchFactory?.(source) ??
        createPoliteFetch({
          cacheDir: path.join(getRoot(), ".cache", "fetch", source.id),
          userAgent: source.politeness?.userAgent ?? "tiki.place-bot/1.0 (+https://tiki.place/sources)",
          minIntervalMs: source.politeness?.minIntervalMs ?? 1000,
          maxRequests: source.politeness?.maxRequestsPerRun ?? 100,
        });
      const result = await adapter.discover({ source, fetch, now, log, dryRun: Boolean(opts.dryRun), prior });
      for (const o of result.observations) if (o.sourceId !== source.id) throw new Error(`adapter emitted sourceId "${o.sourceId}"`);
      let next = result.observations;
      if (!result.complete) {
        const byRef = new Map(prior.map((o) => [o.sourceRef, o]));
        for (const o of next) byRef.set(o.sourceRef, o);
        next = [...byRef.values()];
      } else {
        completeRefs.set(source.id, new Set(next.map((o) => o.sourceRef)));
        if (prior.length >= 20 && next.length < prior.length * 0.7) {
          warn(`${source.id}: listing shrank from ${prior.length} to ${next.length}; keeping prior observations and skipping missing-marks`);
          completeRefs.delete(source.id);
          const byRef = new Map(prior.map((o) => [o.sourceRef, o]));
          for (const o of next) byRef.set(o.sourceRef, o);
          next = [...byRef.values()];
        }
      }
      observations.set(source.id, next);
      state.sources[source.id] = { lastRunAt: nowIso, lastDiscoveryAt: nowIso, lastStatus: "ok", observationCount: next.length, requestCount: fetch.requests };
      ranSources.push(source.id);
      log.info(`✓ ${source.id}: ${next.length} observations (${fetch.requests} requests)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(`${source.id}: discovery failed: ${message}`);
      state.sources[source.id] = { ...sourceState, lastRunAt: nowIso, lastStatus: "error", error: message.slice(0, 500) };
    }
  }

  // ---- resolve + merge ----
  const index = new PlaceIndex(placeMap.values());
  const links = buildLinks(decisions, redirects);
  const byPlace = new Map<string, Observation[]>();
  const created: { place: Place; via: string }[] = [];
  const mergeCtx = { sources: sourceMap, now };
  const orderedSources = [...sources].sort((a, b) => (a.id === "google" ? -1 : b.id === "google" ? 1 : b.trust - a.trust));
  for (const source of orderedSources) {
    for (const obs of latestPerKey(observations.get(source.id) ?? [])) {
      const r = resolveObservation(obs, index, links);
      if (r.kind === "match") {
        byPlace.set(r.place.id, [...(byPlace.get(r.place.id) ?? []), obs]);
        continue;
      }
      if (!canCreate(obs, source)) continue; // name-only hits only corroborate existing places
      const slug = uniqueSlug(placeSlug(obs.name, obs.address.locality), (s) => index.places.has(s) || s in redirects);
      const skeleton = newPlaceSkeleton(slug, now);
      skeleton.firstSeenAt = obs.observedAt;
      const place = mergePlace(skeleton, [obs], mergeCtx);
      index.add(place);
      byPlace.set(slug, [obs]);
      created.push({ place, via: observationKey(obs) });
    }
  }
  const remerge = (id: string) => {
    const place = index.places.get(id)!;
    const merged = mergePlace(place, byPlace.get(id) ?? [], mergeCtx);
    index.refresh(merged);
    return merged;
  };
  for (const id of [...index.places.keys()]) remerge(id);

  // missing marks for sources with a complete listing
  for (const [sourceId, refs] of completeRefs) {
    for (const place of index.places.values()) {
      for (const s of place.sources) {
        if (s.sourceId !== sourceId) continue;
        if (refs.has(s.sourceRef)) delete s.missingSince;
        else s.missingSince ??= nowIso;
      }
    }
  }

  const score = (place: Place) => {
    const obs = byPlace.get(place.id) ?? [];
    place.tikiConfidence = tikiConfidence(place, obs, sourceMap);
    const next = nextReviewState(place, place.tikiConfidence);
    if (next.state !== place.review.state) place.review = { state: next.state, by: "auto", at: nowIso, reason: next.reason };
    place.status = deriveStatus(place, obs, now);
  };
  for (const place of index.places.values()) score(place);

  // ---- verify (Google) ----
  let googleCalls = 0;
  const resolvedNow: string[] = [];
  const unresolved: { id: string; outcome: string }[] = [];
  const googleSource = sourceMap.get("google");
  const apiKey = opts.googleApiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!opts.skipVerify && !opts.offline && !opts.dryRun && googleSource && (apiKey || opts.googleClientFactory)) {
    const cfg = googleSource.config as { monthlyFree?: SkuCounts; textSearchDailyCap?: number };
    const monthlyFree: SkuCounts = cfg.monthlyFree ?? { essentials: 10000, pro: 5000, enterprise: 1000, textSearch: 5000 };
    const textSearchDailyCap = opts.force ? Math.max(cfg.textSearchDailyCap ?? 20, 400) : (cfg.textSearchDailyCap ?? 20);
    const budget = new GoogleBudget(ledger, { monthlyFree, textSearchDailyCap }, now);
    const spend = (sku: keyof SkuCounts) => {
      budget.spend(sku);
      googleCalls++;
    };
    const client = opts.googleClientFactory ? opts.googleClientFactory() : createGoogleClient({ apiKey: apiKey! });
    const googleByRef = new Map((observations.get("google") ?? []).map((o) => [o.sourceRef, o]));
    const lastGoogleSeenAt = (p: Place) => (p.externalIds.google ? googleByRef.get(p.externalIds.google)?.observedAt : undefined);
    const plan = planGoogleWork([...index.places.values()], budget, now, { lastGoogleSeenAt });
    log.info(`google plan: resolve ${plan.resolve.length}, refresh ${plan.refresh.length}, status ${plan.statusCheck.length}`);

    const attach = (place: Place, obs: Observation) => {
      googleByRef.set(obs.sourceRef, obs);
      byPlace.set(place.id, [...(byPlace.get(place.id) ?? []).filter((o) => observationKey(o) !== observationKey(obs)), obs]);
      const merged = remerge(place.id);
      score(merged);
      return merged;
    };

    let stop = false;
    for (const place of plan.resolve) {
      if (stop || !budget.canSpend("textSearch")) break;
      const query = place.location ? `${place.name} ${place.address.locality ?? ""}`.trim() : `${place.name} tiki bar`;
      const bias = place.location ? { lat: place.location.lat, lng: place.location.lng, radiusM: place.location.precision === "locality" ? 5000 : 500 } : undefined;
      try {
        spend("textSearch");
        const results = await client.textSearch(query, { bias });
        const pick = pickCandidate(place, results);
        if (pick.outcome === "accept") {
          const owner = index.byExternal("google", pick.place.id);
          if (owner && owner.id !== place.id) {
            place.resolution = { attemptedAt: nowIso, result: "ambiguous", candidates: [{ googleId: pick.place.id, name: pick.place.displayName?.text ?? "", distanceM: pick.distanceM ?? -1, nameSim: Number(pick.nameSim.toFixed(3)) }] };
            warn(`${place.id}: resolves to Google place already owned by ${owner.id}; consider \`pnpm review merge ${place.id} --into ${owner.id}\``);
            unresolved.push({ id: place.id, outcome: `duplicate of ${owner.id}` });
            continue;
          }
          place.externalIds.google = pick.place.id;
          delete place.resolution;
          if (pick.weak && place.review.by === "auto") place.review = { state: "needs_review", by: "auto", at: nowIso, reason: WEAK_RESOLUTION_REASON };
          index.refresh(place);
          attach(place, googleToObservation(pick.place, "google", nowIso));
          resolvedNow.push(place.id);
        } else {
          place.resolution = { attemptedAt: nowIso, result: pick.outcome, candidates: pick.candidates };
          unresolved.push({ id: place.id, outcome: pick.outcome });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warn(`${place.id}: text search failed: ${message}`);
        if (/\b(403|429)\b/.test(message)) stop = true;
      }
    }

    // Newly resolved places deserve a full refresh right away.
    for (const id of resolvedNow) {
      const p = index.places.get(id);
      if (p && !plan.refresh.includes(p)) plan.refresh.push(p);
    }

    const carryRich = (prior: Observation | undefined, fresh: Observation): Observation =>
      prior
        ? {
            ...fresh,
            hours: fresh.hours ?? prior.hours,
            rating: fresh.rating ?? prior.rating,
            priceLevel: fresh.priceLevel ?? prior.priceLevel,
            website: fresh.website ?? prior.website,
            phone: fresh.phone ?? prior.phone,
          }
        : fresh;

    for (const [list, tier] of [
      [plan.refresh, "enterprise"],
      [plan.statusCheck, "pro"],
    ] as const) {
      for (const place of list) {
        if (stop || !budget.canSpend(tier)) break;
        const id = place.externalIds.google!;
        try {
          spend(tier);
          const gp = await client.details(id, tier);
          if (!gp) {
            warn(`${place.id}: Google place ${id} no longer exists (404); needs review`);
            if (place.review.by === "auto") place.review = { state: "needs_review", by: "auto", at: nowIso, reason: "google place id retired" };
            continue;
          }
          const fresh = googleToObservation(gp, "google", nowIso);
          attach(place, tier === "pro" ? carryRich(googleByRef.get(id), fresh) : fresh);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warn(`${place.id}: details failed: ${message}`);
          if (/\b(403|429)\b/.test(message)) stop = true;
        }
      }
    }
    observations.set("google", [...googleByRef.values()]);
  }

  // ---- final bookkeeping ----
  const finalPlaces = [...index.places.values()];
  for (const place of finalPlaces) {
    const before = original.get(place.id);
    const after = serializePlace(place);
    if (before !== undefined && before !== after && place.lastSyncedAt < nowIso) {
      const stripped = (s: string) => s.replace(/"lastSyncedAt": "[^"]+"/, "");
      if (stripped(before) !== stripped(after)) place.lastSyncedAt = nowIso;
    }
  }
  const changed = finalPlaces.filter((p) => original.get(p.id) !== serializePlace(p));
  const deleted = [...original.keys()].filter((id) => !index.places.has(id));
  const published = finalPlaces.filter(isPublished);
  const flipped = finalPlaces.filter((p) => originallyPublished.has(p.id) && (p.review.state === "rejected" || p.status.value === "closed")).length;
  const needsReview = finalPlaces.filter((p) => p.review.state === "needs_review").length;

  const summary: RunSummary = {
    at: nowIso,
    durationMs: Date.now() - started,
    sources: ranSources,
    placesCreated: created.length,
    placesUpdated: changed.length - created.length,
    placesPublished: published.length,
    needsReview,
    googleCalls,
    warnings,
  };

  // ---- circuit breaker ----
  let tripped: string | undefined;
  if (!opts.force && original.size > 0) {
    if (created.length > CIRCUIT.maxNewPlaces) tripped = `${created.length} new places exceeds ${CIRCUIT.maxNewPlaces}`;
    else if (original.size >= 20 && changed.length / original.size > CIRCUIT.maxChangedFraction) tripped = `${changed.length}/${original.size} places changed`;
    else if (originallyPublished.size >= 20 && flipped / originallyPublished.size > CIRCUIT.maxFlippedFraction) tripped = `${flipped} published places flipped to closed/rejected`;
  }

  // ---- validate (throws on an invalid place) ----
  for (const p of finalPlaces) serializePlace(p);
  buildPublicData(finalPlaces);

  const report = renderReport({ summary, created, resolvedNow, unresolved, deleted, tripped, dryRun: Boolean(opts.dryRun), budgetToday: ledger.days[nowIso.slice(0, 10)] });
  fs.mkdirSync(path.join(getRoot(), ".cache"), { recursive: true });
  fs.writeFileSync(path.join(getRoot(), ".cache", "summary.md"), report);

  if (tripped) {
    log.warn(`circuit breaker tripped: ${tripped}. Nothing written. Re-run with --force to override.`);
    return { code: 1, summary, report, tripped };
  }
  if (opts.dryRun) return { code: 0, summary, report };

  // ---- write ----
  for (const p of changed) writePlace(p);
  for (const id of deleted) deletePlace(id);
  for (const [sourceId, obs] of observations) writeObservations(sourceId, obs);
  writeLedger(ledger);
  writeRedirects(redirects);
  if (!opts.offline) state.runs = [summary, ...state.runs].slice(0, 30);
  writeSyncState(state);
  return { code: 0, summary, report };
}

function renderReport(input: {
  summary: RunSummary;
  created: { place: Place; via: string }[];
  resolvedNow: string[];
  unresolved: { id: string; outcome: string }[];
  deleted: string[];
  tripped?: string;
  dryRun: boolean;
  budgetToday?: SkuCounts;
}): string {
  const { summary: s } = input;
  const lines: string[] = [];
  lines.push(`## Sync ${input.dryRun ? "(dry run) " : ""}${s.at.slice(0, 16).replace("T", " ")} UTC`);
  if (input.tripped) lines.push(`\n**Circuit breaker tripped:** ${input.tripped}\n`);
  lines.push("");
  lines.push(`| created | updated | published | needs review | google calls | sources run |`);
  lines.push(`|---|---|---|---|---|---|`);
  lines.push(`| ${s.placesCreated} | ${s.placesUpdated} | ${s.placesPublished} | ${s.needsReview} | ${s.googleCalls} | ${s.sources.join(", ") || "none"} |`);
  if (input.budgetToday) {
    const b = input.budgetToday;
    lines.push(`\nGoogle today: pro ${b.pro}, enterprise ${b.enterprise}, text search ${b.textSearch}`);
  }
  if (input.created.length) {
    lines.push(`\n### New places (${input.created.length})`);
    for (const { place, via } of input.created.slice(0, 50)) lines.push(`- \`${place.id}\` ${place.name} ← ${via}`);
    if (input.created.length > 50) lines.push(`- … and ${input.created.length - 50} more`);
  }
  if (input.resolvedNow.length) lines.push(`\n### Resolved to Google (${input.resolvedNow.length})\n${input.resolvedNow.map((id) => `- \`${id}\``).join("\n")}`);
  if (input.unresolved.length) lines.push(`\n### Unresolved (${input.unresolved.length})\n${input.unresolved.map((u) => `- \`${u.id}\`: ${u.outcome}`).join("\n")}`);
  if (input.deleted.length) lines.push(`\n### Merged away\n${input.deleted.map((id) => `- \`${id}\``).join("\n")}`);
  if (s.warnings.length) lines.push(`\n### Warnings (${s.warnings.length})\n${s.warnings.slice(0, 40).map((w) => `- ${w}`).join("\n")}`);
  return lines.join("\n") + "\n";
}
