import type { AdapterId } from "@/lib/schema";
import type { Adapter } from "./types";
import { osmOverpassAdapter } from "./osm-overpass";
import { overtureAdapter } from "./overture";
import { tikiratAdapter } from "./tikirat";

/** Discovery adapters by id. Google is the verifier and is driven by the scheduler, not listed here. */
export const adapters: Partial<Record<AdapterId, Adapter>> = {
  tikirat: tikiratAdapter,
  "osm-overpass": osmOverpassAdapter,
  overture: overtureAdapter,
};

export function getAdapter(id: AdapterId): Adapter {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`no discovery adapter registered for "${id}"`);
  return adapter;
}
