import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMasterList, tikiwanderlustAdapter } from "../adapters/tikiwanderlust";
import type { PoliteFetch } from "../core/fetch";
import { mergePlace, newPlaceSkeleton } from "../core/merge";
import { NOW, source, tempRoot } from "./helpers";

const list = `Tiki Bars
Lodging
Master List

California
– the Luau (San Diego)
– Pagan Idol ( San Francisco)
– the CanTiki (N Hollywood)
– Trader Vic's (Los Angeles) – Coming Soon

Arizona
– Hula's Modern Tiki (High Street, Phoenix)
– Hula's Modern Tiki (N 7th St, Phoenix)
– Undertow (Phoenix & Gilbert)

Colorado
– Hell or High Water (Denver) – Temporarily Closed for Relocation

District of Columbia
– Tiki on 18th

Tiki Bars
Members
`;

describe("tikiwanderlust adapter", () => {
  it("parses saved page text, ignoring page chrome", () => {
    const entries = parseMasterList(list);
    expect(entries).toHaveLength(9);
    expect(entries[0]).toEqual({ ref: "luau-san-diego", name: "The Luau", city: "San Diego", state: "California", status: null });
    expect(entries.find((e) => e.name === "Pagan Idol")?.city).toBe("San Francisco");
    expect(entries.find((e) => e.name === "The CanTiki")?.city).toBe("North Hollywood");
    expect(entries.find((e) => e.name === "Trader Vic's")?.status).toBe("coming_soon");
    expect(entries.filter((e) => e.name === "Hula's Modern Tiki").map((e) => [e.ref, e.city])).toEqual([
      ["hulas-modern-tiki-high-street-phoenix", "Phoenix"],
      ["hulas-modern-tiki-n-7th-st-phoenix", "Phoenix"],
    ]);
    expect(entries.find((e) => e.name === "Undertow")?.city).toBe("Phoenix");
    expect(entries.find((e) => e.name === "Hell or High Water")?.status).toBe("temporarily_closed");
    expect(entries.find((e) => e.name === "Tiki on 18th")).toMatchObject({ city: "Washington", state: "District of Columbia" });
  });

  it("reads only the snapshot and opts places it alone lists out of the daily sync", async () => {
    const root = tempRoot({ "data/snapshots/tikiwanderlust.txt": `California\n${Array.from({ length: 60 }, (_, i) => `– Bar ${i} (Town ${i})`).join("\n")}\n` });
    process.env.TIKI_ROOT = root;
    const fetch = (async () => {
      throw new Error("a manual source must not touch the network");
    }) as unknown as PoliteFetch;
    const manual = source({ id: "tikiwanderlust", adapter: "tikiwanderlust", schedule: { discovery: "manual" } });
    const daily = source({ id: "tikirat" });
    try {
      const { observations, complete } = await tikiwanderlustAdapter.discover({ source: manual, fetch, now: NOW, log: { info() {}, warn() {} }, dryRun: true, prior: [] });
      expect(complete).toBe(true);
      const obs = observations[0]!;
      expect(obs).toMatchObject({ name: "Bar 0", url: "https://tikiwanderlust.com/master-list/", address: { locality: "Town 0", region: "California", country: "US" }, tags: ["tiki-directory"] });
      const sources = new Map([
        ["tikiwanderlust", manual],
        ["tikirat", daily],
      ]);
      const ctx = { sources, now: NOW };
      const alone = mergePlace(newPlaceSkeleton("bar-0", NOW), [obs], ctx);
      expect(alone.syncPolicy).toBe("manual");
      const shared = mergePlace(alone, [obs, { ...obs, sourceId: "tikirat", sourceRef: "bar-0" }], ctx);
      expect(shared.syncPolicy).toBeUndefined();
    } finally {
      delete process.env.TIKI_ROOT;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
