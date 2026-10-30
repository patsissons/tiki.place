/**
 * Tiki Wanderlust (tikiwanderlust.com/master-list): a list of US tiki bars by state.
 * The site challenges automated clients, so this source is manual: someone saves the
 * page text from a real browser to config.snapshot and runs it at long intervals. The
 * adapter reads only that file. Places only this source lists opt out of the daily sync.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getRoot } from "@/lib/data/store";
import { slugify } from "@/lib/slug";
import type { Observation } from "@/lib/schema";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations } from "./types";

const ConfigSchema = z.object({
  url: z.url().default("https://tikiwanderlust.com/master-list/"),
  snapshot: z.string().default("data/snapshots/tikiwanderlust.txt"),
});

export type ListEntry = { ref: string; name: string; city: string; state: string; status: Observation["statusHint"] };

function statusHint(note: string): Observation["statusHint"] {
  if (/temporar|renovation|relocation|season/i.test(note)) return "temporarily_closed";
  if (/coming|opening/i.test(note)) return "coming_soon";
  return null;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const capitalized = (s: string) => s.replace(/^the\b/, "The");

/** "the Luau (San Diego) – Coming Soon" under a state heading. Lines without the leading dash are headings or page chrome. */
export function parseMasterList(text: string): ListEntry[] {
  const entries = new Map<string, ListEntry>();
  let state = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!/^[–—-]\s/.test(line)) {
      state = line;
      continue;
    }
    const m = /^[–—-]\s+(.+?)(?:\s*\(([^)]*)\))?(?:\s+[–—-]\s+(.+))?$/.exec(line);
    if (!m) continue;
    const name = capitalized(tidy(m[1]!));
    const where = tidy(m[2] ?? "");
    // "High Street, Phoenix" names a location in a city; "Phoenix & Gilbert" is filed under the first.
    const city = (where.split(",").pop() ?? "").split("&")[0]!.trim().replace(/^N\s/, "North ") || (state === "District of Columbia" ? "Washington" : "");
    const ref = slugify(where ? `${name} ${where}` : `${name} ${state}`);
    entries.set(ref, { ref, name, city, state, status: statusHint(m[3] ?? "") });
  }
  return [...entries.values()];
}

export const tikiwanderlustAdapter: Adapter = {
  id: "tikiwanderlust",

  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const file = path.join(getRoot(), config.snapshot);
    if (!fs.existsSync(file)) throw new Error(`snapshot ${config.snapshot} not found`);
    const entries = parseMasterList(fs.readFileSync(file, "utf8"));
    if (entries.length < 50) throw new Error(`snapshot yielded only ${entries.length} bars; is it the master list page text?`);
    const observedAt = ctx.now.toISOString();
    const observations = entries.map((e) =>
      makeObservation({
        sourceId: ctx.source.id,
        sourceRef: e.ref,
        url: config.url,
        name: e.name,
        address: { locality: e.city || undefined, region: e.state, country: "US" },
        coords: null,
        coordsPrecision: "none",
        statusHint: e.status,
        tags: ["tiki-directory"],
        observedAt,
      }),
    );
    return { observations: reconcileObservations(ctx.prior, observations), complete: true };
  },
};
