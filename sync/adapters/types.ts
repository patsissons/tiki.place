import { createHash } from "node:crypto";
import { ObservationSchema, type AdapterId, type Observation, type Source } from "@/lib/schema";
import type { PoliteFetch } from "../core/fetch";

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export interface AdapterContext {
  source: Source;
  fetch: PoliteFetch;
  now: Date;
  log: Logger;
  dryRun: boolean;
  /** Observations committed from the previous run of this source. */
  prior: Observation[];
}

export interface DiscoverResult {
  observations: Observation[];
  /** True when the adapter saw the source's complete listing, so refs it did not yield can be marked missing. */
  complete: boolean;
}

export interface Adapter {
  id: AdapterId;
  /** Listing pass. May yield partial records (no coords) that `refresh` or Google will complete. */
  discover(ctx: AdapterContext): Promise<DiscoverResult>;
  /** Optional detail pass for observations due for a re-fetch, oldest first. */
  refresh?(ctx: AdapterContext, due: Observation[]): Promise<Observation[]>;
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

type ObservationInput = Omit<Observation, "rawHash" | "altNames" | "address" | "categories" | "tags" | "externalIds"> &
  Partial<Pick<Observation, "altNames" | "address" | "categories" | "tags" | "externalIds">>;

/** Build a validated observation; rawHash covers everything except observedAt. */
export function makeObservation(input: ObservationInput): Observation {
  const { observedAt, ...rest } = input;
  const rawHash = hashPayload(rest);
  return ObservationSchema.parse({ ...input, observedAt, rawHash });
}

/** Keep the prior observedAt when the payload has not changed, so unchanged data never churns. */
export function reconcileObservations(prior: Observation[], fresh: Observation[]): Observation[] {
  const byRef = new Map(prior.map((o) => [o.sourceRef, o]));
  return fresh.map((o) => {
    const before = byRef.get(o.sourceRef);
    return before && before.rawHash === o.rawHash ? { ...o, observedAt: before.observedAt } : o;
  });
}

export function safeUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  let v = value.trim();
  if (!v) return undefined;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".")) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
