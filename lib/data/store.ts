/**
 * The git-backed database. Every file has one canonical serialization so that
 * re-writing unchanged data produces no diff.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  DecisionsFileSchema,
  LedgerSchema,
  ObservationSchema,
  PlaceSchema,
  SourceSchema,
  SyncStateSchema,
  emptyLedger,
  emptySyncState,
  type Decision,
  type Ledger,
  type Observation,
  type Place,
  type Source,
  type SyncState,
} from "../schema";
import { z } from "zod";

/** Repo root. TIKI_ROOT overrides it (tests point it at a temp directory). */
export const getRoot = () => (process.env.TIKI_ROOT ? path.resolve(process.env.TIKI_ROOT) : process.cwd());
const dataDir = () => path.join(getRoot(), "data");
export const publicDataDir = () => path.join(getRoot(), "public", "data");

export const paths = {
  get sources() {
    return path.join(dataDir(), "sources");
  },
  get places() {
    return path.join(dataDir(), "places");
  },
  get observations() {
    return path.join(dataDir(), "observations");
  },
  get decisions() {
    return path.join(dataDir(), "decisions.yml");
  },
  get ledger() {
    return path.join(dataDir(), "ledger", "google.json");
  },
  get syncState() {
    return path.join(dataDir(), "sync-state.json");
  },
  get redirects() {
    return path.join(dataDir(), "redirects.json");
  },
  source: (id: string) => path.join(dataDir(), "sources", `${id}.yml`),
  place: (id: string) => path.join(dataDir(), "places", `${id}.json`),
  observationFile: (sourceId: string) => path.join(dataDir(), "observations", `${sourceId}.jsonl`),
};

const RedirectsSchema = z.record(z.string(), z.string());
export type Redirects = z.infer<typeof RedirectsSchema>;

// ---------- canonical serializers ----------

export const serializeJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export const serializeYaml = (value: unknown) => YAML.stringify(value, { lineWidth: 0 });

export function serializePlace(place: Place): string {
  return serializeJson(PlaceSchema.parse(place));
}
export function serializeSource(source: Source): string {
  return serializeYaml(SourceSchema.parse(source));
}
export function serializeObservations(observations: Observation[]): string {
  const sorted = [...observations].sort((a, b) => (a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0));
  return sorted.map((o) => JSON.stringify(ObservationSchema.parse(o))).join("\n") + (sorted.length ? "\n" : "");
}
export const serializeDecisions = (d: Decision[]) => serializeYaml(DecisionsFileSchema.parse(d));
export const serializeLedger = (l: Ledger) => serializeJson(LedgerSchema.parse(l));
export const serializeSyncState = (s: SyncState) => serializeJson(SyncStateSchema.parse(s));
export const serializeRedirects = (r: Redirects) =>
  serializeJson(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))));

// ---------- fs helpers ----------

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write only when content differs, so timestamps and git status stay quiet. */
export function writeIfChanged(file: string, content: string): boolean {
  const current = readText(file);
  if (current === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => path.join(dir, f));
}

export class DataError extends Error {
  constructor(
    public file: string,
    message: string,
  ) {
    super(`${path.relative(getRoot(), file)}: ${message}`);
  }
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DataError(file, z.prettifyError(result.error));
  return result.data;
}

// ---------- readers ----------

export function readSources(): Source[] {
  return listFiles(paths.sources, ".yml").map((file) => {
    const source = parseWith(SourceSchema, YAML.parse(readText(file) ?? ""), file);
    const expected = paths.source(source.id);
    if (path.resolve(expected) !== path.resolve(file)) throw new DataError(file, `source id "${source.id}" does not match file name`);
    return source;
  });
}

export function readPlaces(): Place[] {
  return listFiles(paths.places, ".json").map((file) => readPlaceFile(file));
}

export function readPlaceFile(file: string): Place {
  const place = parseWith(PlaceSchema, JSON.parse(readText(file) ?? "null"), file);
  if (path.resolve(paths.place(place.id)) !== path.resolve(file)) throw new DataError(file, `place id "${place.id}" does not match file name`);
  return place;
}

export function readObservations(sourceId: string): Observation[] {
  const text = readText(paths.observationFile(sourceId));
  if (!text) return [];
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, i) => parseWith(ObservationSchema, JSON.parse(line), `${paths.observationFile(sourceId)}:${i + 1}`));
}

export function observationSourceIds(): string[] {
  return listFiles(paths.observations, ".jsonl").map((f) => path.basename(f, ".jsonl"));
}

export function readDecisions(): Decision[] {
  const text = readText(paths.decisions);
  if (!text) return [];
  return parseWith(DecisionsFileSchema, YAML.parse(text) ?? [], paths.decisions);
}

export function readLedger(): Ledger {
  const text = readText(paths.ledger);
  return text ? parseWith(LedgerSchema, JSON.parse(text), paths.ledger) : emptyLedger();
}

export function readSyncState(): SyncState {
  const text = readText(paths.syncState);
  return text ? parseWith(SyncStateSchema, JSON.parse(text), paths.syncState) : emptySyncState();
}

export function readRedirects(): Redirects {
  const text = readText(paths.redirects);
  return text ? parseWith(RedirectsSchema, JSON.parse(text), paths.redirects) : {};
}

// ---------- writers ----------

export const writePlace = (place: Place) => writeIfChanged(paths.place(place.id), serializePlace(place));
export const deletePlace = (id: string) => fs.rmSync(paths.place(id), { force: true });
export const writeSource = (source: Source) => writeIfChanged(paths.source(source.id), serializeSource(source));
export const writeObservations = (sourceId: string, observations: Observation[]) =>
  writeIfChanged(paths.observationFile(sourceId), serializeObservations(observations));
export const writeDecisions = (decisions: Decision[]) => writeIfChanged(paths.decisions, serializeDecisions(decisions));
export const appendDecision = (decision: Decision) => writeDecisions([...readDecisions(), decision]);
export const writeLedger = (ledger: Ledger) => writeIfChanged(paths.ledger, serializeLedger(ledger));
export const writeSyncState = (state: SyncState) => writeIfChanged(paths.syncState, serializeSyncState(state));
export const writeRedirects = (redirects: Redirects) => writeIfChanged(paths.redirects, serializeRedirects(redirects));

/** Raw file text, for the byte-identical re-serialization check in validate. */
export const rawText = readText;
export { listFiles };
