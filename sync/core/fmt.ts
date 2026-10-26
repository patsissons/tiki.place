import path from "node:path";
import {
  getRoot,
  observationSourceIds,
  paths,
  readDecisions,
  readLedger,
  readObservations,
  readPlaces,
  readRedirects,
  readSources,
  readSyncState,
  rawText,
  writeDecisions,
  writeLedger,
  writeObservations,
  writePlace,
  writeRedirects,
  writeSource,
  writeSyncState,
} from "@/lib/data/store";

/** Rewrite every data file in canonical form. Returns the relative paths that changed. */
export function formatAll(): string[] {
  const changed: string[] = [];
  const note = (file: string, did: boolean) => did && changed.push(path.relative(getRoot(), file));
  for (const s of readSources()) note(paths.source(s.id), writeSource(s));
  for (const p of readPlaces()) note(paths.place(p.id), writePlace(p));
  for (const id of observationSourceIds()) note(paths.observationFile(id), writeObservations(id, readObservations(id)));
  if (rawText(paths.decisions) !== null) note(paths.decisions, writeDecisions(readDecisions()));
  if (rawText(paths.ledger) !== null) note(paths.ledger, writeLedger(readLedger()));
  if (rawText(paths.syncState) !== null) note(paths.syncState, writeSyncState(readSyncState()));
  if (rawText(paths.redirects) !== null) note(paths.redirects, writeRedirects(readRedirects()));
  return changed;
}
