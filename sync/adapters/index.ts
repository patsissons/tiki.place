import type { AdapterId } from "@/lib/schema";
import type { Adapter } from "./types";
import { googleMyMapsAdapter } from "./google-mymaps";
import { mytikiAdapter } from "./mytiki";
import { osmOverpassAdapter } from "./osm-overpass";
import { overtureAdapter } from "./overture";
import { tikiatlasAdapter } from "./tikiatlas";
import { tikiratAdapter } from "./tikirat";
import { tikiwanderlustAdapter } from "./tikiwanderlust";
import { userSubmissionAdapter } from "./user-submission";

/** Discovery adapters by id. Google is the verifier and is driven by the scheduler, not listed here. */
export const adapters: Partial<Record<AdapterId, Adapter>> = {
  tikirat: tikiratAdapter,
  tikiwanderlust: tikiwanderlustAdapter,
  "osm-overpass": osmOverpassAdapter,
  overture: overtureAdapter,
  "user-submission": userSubmissionAdapter,
  mytiki: mytikiAdapter,
  tikiatlas: tikiatlasAdapter,
  "google-mymaps": googleMyMapsAdapter,
};

export function getAdapter(id: AdapterId): Adapter {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`no discovery adapter registered for "${id}"`);
  return adapter;
}
