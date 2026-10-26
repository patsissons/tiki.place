import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Observation, Place, Source } from "@/lib/schema";
import { makeObservation } from "../adapters/types";

export const NOW = new Date("2026-11-01T10:00:00.000Z");
export const ISO = NOW.toISOString();

export function source(overrides: Partial<Source> & { id: string }): Source {
  return {
    name: overrides.id,
    homepage: "https://example.com",
    adapter: "tikirat",
    status: "active",
    license: { name: "test", attribution: "test" },
    trust: 0.6,
    tikiSignal: 0.8,
    schedule: { discovery: "daily" },
    config: {},
    addedAt: "2026-01-01",
    ...overrides,
  };
}

export function obs(overrides: Partial<Observation> & { sourceId: string; sourceRef: string; name: string }): Observation {
  return makeObservation({
    coords: null,
    coordsPrecision: "none",
    statusHint: null,
    observedAt: ISO,
    ...overrides,
  });
}

export function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    name: overrides.id,
    aliases: [],
    location: null,
    address: {},
    externalIds: {},
    status: { value: "unverified", sourceId: "system", at: ISO },
    contact: {},
    tikiConfidence: 0,
    review: { state: "needs_review", by: "auto", at: ISO },
    provenance: {},
    sources: [],
    firstSeenAt: ISO,
    lastSyncedAt: ISO,
    ...overrides,
  };
}

/** A throwaway data root with the given files, for engine tests. */
export function tempRoot(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiki-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

export const fixture = (rel: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "__fixtures__", rel), "utf8");
