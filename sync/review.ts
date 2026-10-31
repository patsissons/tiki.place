/** Owner triage. Every subcommand records a decision and replays the engine offline. */
import fs from "node:fs";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { appendDecision, readDecisions, readObservations, readPlaces, readRedirects, readSources, writeDecisions } from "@/lib/data/store";
import { DecisionSchema, type Decision, type Place } from "@/lib/schema";
import { runEngine } from "./core/engine";

const usage = `usage:
  pnpm review list [--source id] [--min-confidence n] [--state needs_review|auto_approved|approved|rejected] [--limit n]
  pnpm review show <slug>
  pnpm review approve <slug> [--note text]
  pnpm review reject <slug> --reason text
  pnpm review merge <from-slug> --into <slug>
  pnpm review link <sourceId:sourceRef> --to <slug>
  pnpm review pin <slug> <field> <json-value>
  pnpm review resolve <slug> --google <placeId>
  pnpm review batch <file.yml> [--by owner|skill]`;

async function apply(decision: Decision) {
  appendDecision(decision);
  const result = await runEngine({ offline: true, skipVerify: true, force: true, log: { info: () => {}, warn: (m) => console.warn(`⚠ ${m}`) } });
  console.log(`recorded ${decision.type}; ${result.summary.placesUpdated} place(s) updated, ${result.summary.needsReview} still need review`);
  return result.code;
}

function findPlace(slug: string): Place {
  const redirects = readRedirects();
  const id = redirects[slug] ?? slug;
  const place = readPlaces().find((p) => p.id === id);
  if (!place) throw new Error(`no place "${slug}"`);
  return place;
}

export async function reviewCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const at = new Date().toISOString();
  switch (sub) {
    case "list": {
      const { values } = parseArgs({
        args: rest,
        options: {
          source: { type: "string" },
          "min-confidence": { type: "string" },
          state: { type: "string", default: "needs_review" },
          limit: { type: "string", default: "50" },
        },
      });
      const min = values["min-confidence"] ? Number(values["min-confidence"]) : 0;
      const rows = readPlaces()
        .filter((p) => p.review.state === values.state)
        .filter((p) => p.tikiConfidence >= min)
        .filter((p) => !values.source || p.sources.some((s) => s.sourceId === values.source))
        .sort((a, b) => b.tikiConfidence - a.tikiConfidence || a.id.localeCompare(b.id))
        .slice(0, Number(values.limit));
      if (rows.length === 0) {
        console.log(`no places in state ${values.state}`);
        return 0;
      }
      for (const p of rows) {
        const where = [p.address.locality, p.address.region, p.address.country].filter(Boolean).join(", ") || "location unknown";
        const srcs = p.sources.map((s) => s.sourceId).join("+");
        const google = p.externalIds.google ? "G" : p.resolution ? `g:${p.resolution.result}` : "-";
        const reason = p.review.reason ? `  (${p.review.reason})` : "";
        console.log(`${p.tikiConfidence.toFixed(2)}  ${google.padEnd(12)} ${p.id.padEnd(48)} ${p.name} — ${where} [${srcs}]${reason}`);
      }
      console.log(`\n${rows.length} shown`);
      return 0;
    }
    case "show": {
      const slug = rest[0];
      if (!slug) throw new Error(usage);
      const place = findPlace(slug);
      console.log(JSON.stringify(place, null, 2));
      const sourceIds = new Set(place.sources.map((s) => s.sourceId));
      for (const sourceId of sourceIds) {
        const refs = new Set(place.sources.filter((s) => s.sourceId === sourceId).map((s) => s.sourceRef));
        for (const o of readObservations(sourceId).filter((o) => refs.has(o.sourceRef))) console.log(`\n# observation ${sourceId}:${o.sourceRef}\n${JSON.stringify(o, null, 2)}`);
      }
      if (place.location) console.log(`\nhttps://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}`);
      return 0;
    }
    case "approve": {
      const { positionals, values } = parseArgs({ args: rest, options: { note: { type: "string" } }, allowPositionals: true });
      const place = findPlace(positionals[0] ?? "");
      return apply({ type: "approve", place: place.id, at, by: "owner", note: values.note });
    }
    case "reject": {
      const { positionals, values } = parseArgs({ args: rest, options: { reason: { type: "string" } }, allowPositionals: true });
      if (!values.reason) throw new Error("reject needs --reason");
      const place = findPlace(positionals[0] ?? "");
      return apply({ type: "reject", place: place.id, reason: values.reason, at, by: "owner" });
    }
    case "merge": {
      const { positionals, values } = parseArgs({ args: rest, options: { into: { type: "string" } }, allowPositionals: true });
      if (!values.into) throw new Error("merge needs --into");
      const from = findPlace(positionals[0] ?? "");
      const into = findPlace(values.into);
      return apply({ type: "merge", from: from.id, into: into.id, at, by: "owner" });
    }
    case "link": {
      const { positionals, values } = parseArgs({ args: rest, options: { to: { type: "string" } }, allowPositionals: true });
      const key = positionals[0];
      if (!key || !values.to) throw new Error("link needs <sourceId:sourceRef> --to <slug>");
      const sourceId = key.split(":")[0]!;
      if (!readSources().some((s) => s.id === sourceId)) throw new Error(`unknown source "${sourceId}"`);
      return apply({ type: "link", key, place: findPlace(values.to).id, at, by: "owner" });
    }
    case "pin": {
      const [slug, field, raw] = rest;
      if (!slug || !field || raw === undefined) throw new Error(usage);
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      return apply({ type: "pin", place: findPlace(slug).id, field: field as Extract<Decision, { type: "pin" }>["field"], value, at, by: "owner" });
    }
    case "resolve": {
      const { positionals, values } = parseArgs({ args: rest, options: { google: { type: "string" } }, allowPositionals: true });
      if (!values.google) throw new Error("resolve needs --google <placeId>");
      return apply({ type: "resolve", place: findPlace(positionals[0] ?? "").id, google: values.google, at, by: "owner" });
    }
    case "batch": {
      // Many decisions, one replay. Nothing is recorded unless every entry is valid.
      const { positionals, values } = parseArgs({ args: rest, options: { by: { type: "string", default: "skill" } }, allowPositionals: true });
      const file = positionals[0];
      if (!file) throw new Error(usage);
      const entries = YAML.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
      const decisions = entries.map((entry) => DecisionSchema.parse({ at, by: values.by, ...entry }));
      const redirects = readRedirects();
      const known = new Set(readPlaces().map((p) => p.id));
      const merged = new Set(decisions.flatMap((d) => (d.type === "merge" ? [d.from] : [])));
      const decided = new Map<string, Decision["type"]>();
      for (const d of decisions) {
        const slugs = d.type === "merge" ? [d.from, d.into] : [d.place];
        for (const slug of slugs) if (!known.has(slug) && !(slug in redirects)) throw new Error(`batch: no place "${slug}"`);
        if (d.type === "merge" && merged.has(d.into)) throw new Error(`batch: "${d.into}" is merged away; merge into its target`);
        if (d.type !== "approve" && d.type !== "reject") continue;
        if (decided.has(d.place)) throw new Error(`batch: "${d.place}" is decided twice`);
        decided.set(d.place, d.type);
      }
      writeDecisions([...readDecisions(), ...decisions]);
      const result = await runEngine({ offline: true, skipVerify: true, force: true, log: { info: () => {}, warn: (m) => console.warn(`⚠ ${m}`) } });
      console.log(`recorded ${decisions.length} decision(s); ${result.summary.placesUpdated} place(s) updated, ${result.summary.needsReview} still need review`);
      return result.code;
    }
    default:
      console.error(usage);
      return 2;
  }
}
