import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { obs, place, source, tempRoot } from "./helpers";

let root: string;
let store: typeof import("@/lib/data/store");
let review: typeof import("../review");

const writeBatch = (entries: unknown[]) => {
  const file = path.join(root, "batch.yml");
  fs.writeFileSync(file, JSON.stringify(entries));
  return file;
};

beforeEach(async () => {
  root = tempRoot({});
  process.env.TIKI_ROOT = root;
  store = await import("@/lib/data/store");
  review = await import("../review");
  store.writePlace(place({ id: "keep" }));
  store.writePlace(place({ id: "drop" }));
  store.writePlace(place({ id: "dup" }));
});
afterEach(() => {
  delete process.env.TIKI_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("review batch", () => {
  it("records every decision as the skill and replays once", async () => {
    const file = writeBatch([
      { type: "approve", place: "keep", note: "listed" },
      { type: "reject", place: "drop", reason: "not a bar" },
      { type: "merge", from: "dup", into: "keep" },
    ]);
    expect(await review.reviewCommand(["batch", file])).toBe(0);
    expect(store.readDecisions().map((d) => [d.type, d.by])).toEqual([
      ["approve", "skill"],
      ["reject", "skill"],
      ["merge", "skill"],
    ]);
    const places = new Map(store.readPlaces().map((p) => [p.id, p]));
    expect(places.get("keep")?.review.state).toBe("approved");
    expect(places.get("drop")?.review.state).toBe("rejected");
    expect(places.has("dup")).toBe(false);
    expect(store.readRedirects()).toEqual({ dup: "keep" });
  });

  it("records nothing when any entry is invalid", async () => {
    const unknown = writeBatch([
      { type: "approve", place: "keep" },
      { type: "reject", place: "nope", reason: "not a bar" },
    ]);
    await expect(review.reviewCommand(["batch", unknown])).rejects.toThrow(/no place "nope"/);
    const twice = writeBatch([
      { type: "approve", place: "keep" },
      { type: "reject", place: "keep", reason: "not a bar" },
    ]);
    await expect(review.reviewCommand(["batch", twice])).rejects.toThrow(/decided twice/);
    const mergedAway = writeBatch([
      { type: "merge", from: "dup", into: "keep" },
      { type: "merge", from: "drop", into: "dup" },
    ]);
    await expect(review.reviewCommand(["batch", mergedAway])).rejects.toThrow(/merged away/);
    expect(store.readDecisions()).toEqual([]);
  });
});

describe("review create", () => {
  beforeEach(() => {
    store.writeSource(source({ id: "osm", adapter: "osm-overpass", tikiSignal: 0.3 }));
    store.writeObservations("osm", [
      obs({ sourceId: "osm", sourceRef: "node/1", name: "Tiki Bar Athens", tags: ["tiki-name", "bar-category"] }),
      obs({ sourceId: "osm", sourceRef: "node/2", name: "Kept Tiki", tags: ["tiki-name", "bar-category"] }),
    ]);
  });

  it("promotes a stranded record into a queued place", async () => {
    expect(await review.reviewCommand(["create", "osm:node/1"])).toBe(0);
    expect(store.readDecisions().map((d) => d.type)).toEqual(["create"]);
    const created = store.readPlaces().find((p) => p.sources.some((s) => s.sourceRef === "node/1"));
    expect(created).toMatchObject({ name: "Tiki Bar Athens", review: { state: "needs_review" } });
  });

  it("refuses unknown sources, unknown records and records a place already holds", async () => {
    await expect(review.reviewCommand(["create", "nope:node/1"])).rejects.toThrow(/unknown source/);
    await expect(review.reviewCommand(["create", "osm:node/9"])).rejects.toThrow(/no observation/);
    store.writePlace(place({ id: "kept", sources: [{ sourceId: "osm", sourceRef: "node/2", url: "https://example.com", firstSeenAt: "2026-11-01T10:00:00.000Z", lastSeenAt: "2026-11-01T10:00:00.000Z" }] }));
    await expect(review.reviewCommand(["create", "osm:node/2"])).rejects.toThrow(/already belongs to kept/);
    expect(store.readDecisions()).toEqual([]);
  });
});
