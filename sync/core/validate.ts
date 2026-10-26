/**
 * `pnpm validate`: every data file parses, invariants hold, and every file is
 * byte-identical to its canonical serialization (so sync never churns formatting).
 */
import path from "node:path";
import {
  DataError,
  getRoot,
  listFiles,
  paths,
  rawText,
  readDecisions,
  readLedger,
  readObservations,
  readPlaceFile,
  readRedirects,
  readSources,
  readSyncState,
  serializeDecisions,
  serializeLedger,
  serializeObservations,
  serializePlace,
  serializeRedirects,
  serializeSource,
  serializeSyncState,
  observationSourceIds,
} from "@/lib/data/store";
import { isPublished, type Place } from "@/lib/schema";
import { buildPublicData } from "./publish";

export type Problem = { file: string; message: string };

export function validateData(): { problems: Problem[]; places: Place[] } {
  const problems: Problem[] = [];
  const rel = (f: string) => path.relative(getRoot(), f);
  const add = (file: string, message: string) => problems.push({ file: rel(file), message });
  const guard = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof DataError) problems.push({ file: rel(err.file), message: err.message.slice(err.message.indexOf(": ") + 2) });
      else problems.push({ file: "?", message: String(err) });
      return fallback;
    }
  };

  // ---- sources ----
  const sources = guard(() => readSources(), []);
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const s of sources) {
    const file = paths.source(s.id);
    if (rawText(file) !== serializeSource(s)) add(file, "not in canonical form (run `pnpm sync fmt`)");
    if (s.status === "retired" && !s.retiredAt) add(file, "retired source needs retiredAt");
  }

  // ---- places ----
  const places: Place[] = [];
  const externalIndex = new Map<string, string>();
  for (const file of listFiles(paths.places, ".json")) {
    const place = guard(() => readPlaceFile(file), null);
    if (!place) continue;
    places.push(place);
    if (rawText(file) !== serializePlace(place)) add(file, "not in canonical form (run `pnpm sync fmt`)");
    if (isPublished(place)) {
      if (!place.timezone) add(file, "published place needs a timezone");
      if (!place.address.country) add(file, "published place needs address.country");
    }
    for (const [kind, id] of Object.entries(place.externalIds)) {
      const key = `${kind}:${id}`;
      const other = externalIndex.get(key);
      if (other) add(file, `externalIds.${kind} "${id}" is also on ${other}`);
      else externalIndex.set(key, place.id);
    }
    const seenSources = new Set<string>();
    for (const s of place.sources) {
      if (!sourceIds.has(s.sourceId)) add(file, `sources[] references unknown source "${s.sourceId}"`);
      const key = `${s.sourceId}:${s.sourceRef}`;
      if (seenSources.has(key)) add(file, `duplicate source entry ${key}`);
      seenSources.add(key);
    }
    for (const [field, prov] of Object.entries(place.provenance)) {
      if (!sourceIds.has(prov.sourceId) && prov.sourceId !== "owner" && prov.sourceId !== "system") add(file, `provenance.${field} references unknown source "${prov.sourceId}"`);
    }
    if (place.status.sourceId !== "owner" && place.status.sourceId !== "system" && !sourceIds.has(place.status.sourceId)) {
      add(file, `status.sourceId "${place.status.sourceId}" is unknown`);
    }
  }
  const placeIds = new Set(places.map((p) => p.id));

  // ---- observations ----
  for (const sourceId of observationSourceIds()) {
    const file = paths.observationFile(sourceId);
    if (!sourceIds.has(sourceId)) add(file, `observations for unknown source "${sourceId}"`);
    const observations = guard(() => readObservations(sourceId), []);
    if (rawText(file) !== serializeObservations(observations)) add(file, "not sorted/canonical (run `pnpm sync fmt`)");
    const refs = new Set<string>();
    for (const o of observations) {
      if (o.sourceId !== sourceId) add(file, `observation ${o.sourceRef} has sourceId "${o.sourceId}"`);
      if (refs.has(o.sourceRef)) add(file, `duplicate sourceRef ${o.sourceRef}`);
      refs.add(o.sourceRef);
    }
  }

  // ---- decisions ----
  const decisions = guard(() => readDecisions(), []);
  if (rawText(paths.decisions) !== null && rawText(paths.decisions) !== serializeDecisions(decisions)) add(paths.decisions, "not in canonical form");
  const redirects = guard(() => readRedirects(), {});
  const known = (slug: string) => placeIds.has(slug) || slug in redirects;
  decisions.forEach((d, i) => {
    const where = `${paths.decisions}#${i + 1}`;
    if ("place" in d && !known(d.place)) add(where, `${d.type} references unknown place "${d.place}"`);
    if (d.type === "merge" && (!known(d.from) || !known(d.into))) add(where, `merge references unknown place(s)`);
    if (d.type === "link" && !d.key.includes(":")) add(where, `link key must be "sourceId:sourceRef"`);
  });

  // ---- redirects ----
  if (rawText(paths.redirects) !== null && rawText(paths.redirects) !== serializeRedirects(redirects)) add(paths.redirects, "not in canonical form");
  for (const [from, to] of Object.entries(redirects)) {
    if (placeIds.has(from)) add(paths.redirects, `redirect source "${from}" still exists as a place`);
    if (!placeIds.has(to)) add(paths.redirects, `redirect target "${to}" is not a place`);
    if (to in redirects) add(paths.redirects, `redirect chain ${from} -> ${to} -> ${redirects[to]}`);
  }

  // ---- ledger / sync state ----
  const ledger = guard(() => readLedger(), null);
  if (ledger && rawText(paths.ledger) !== null && rawText(paths.ledger) !== serializeLedger(ledger)) add(paths.ledger, "not in canonical form");
  const state = guard(() => readSyncState(), null);
  if (state && rawText(paths.syncState) !== null && rawText(paths.syncState) !== serializeSyncState(state)) add(paths.syncState, "not in canonical form");

  // ---- publish dry run ----
  guard(() => buildPublicData(places), null);

  return { problems, places };
}
