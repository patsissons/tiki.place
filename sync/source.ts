/** Source management for the discovery skill. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getRoot, paths, readSources, readSyncState, writeSource } from "@/lib/data/store";
import { AdapterIdSchema, SourceSchema, type Source } from "@/lib/schema";

const usage = `usage:
  pnpm source list
  pnpm source add --id <slug> --adapter <adapter> --homepage <url> --name <text> [--trust 0.6] [--tiki-signal 0.5] [--discovery daily|weekly|monthly|manual] [--license <name>] [--attribution <text>]
  pnpm source pause <id> | resume <id>
  pnpm source retire <id> --reason <text>`;

export async function sourceCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const today = new Date().toISOString().slice(0, 10);
  switch (sub) {
    case "list": {
      const state = readSyncState();
      for (const s of readSources()) {
        const st = state.sources[s.id];
        console.log(
          `${s.id.padEnd(18)} ${s.status.padEnd(8)} ${s.adapter.padEnd(16)} ${s.schedule.discovery.padEnd(8)} obs=${st?.observationCount ?? 0}  last=${st?.lastRunAt?.slice(0, 10) ?? "never"} ${st?.lastStatus ?? ""} ${st?.error ? `(${st.error.slice(0, 60)})` : ""}`,
        );
      }
      return 0;
    }
    case "add": {
      const { values } = parseArgs({
        args: rest,
        options: {
          id: { type: "string" },
          adapter: { type: "string" },
          homepage: { type: "string" },
          name: { type: "string" },
          trust: { type: "string", default: "0.6" },
          "tiki-signal": { type: "string", default: "0.5" },
          discovery: { type: "string", default: "weekly" },
          license: { type: "string", default: "Facts only, attribution" },
          attribution: { type: "string" },
        },
      });
      if (!values.id || !values.adapter || !values.homepage || !values.name) throw new Error(usage);
      if (readSources().some((s) => s.id === values.id)) throw new Error(`source "${values.id}" already exists`);
      const source: Source = SourceSchema.parse({
        id: values.id,
        name: values.name,
        homepage: values.homepage,
        adapter: AdapterIdSchema.parse(values.adapter),
        status: "active",
        license: { name: values.license, attribution: values.attribution ?? `Listing via ${values.name}` },
        trust: Number(values.trust),
        tikiSignal: Number(values["tiki-signal"]),
        schedule: { discovery: values.discovery },
        politeness: { minIntervalMs: 2000, maxRequestsPerRun: 100, userAgent: "tiki.place-bot/1.0 (+https://tiki.place/sources)" },
        config: {},
        addedAt: today,
      });
      writeSource(source);
      console.log(`wrote ${path.relative(getRoot(), paths.source(source.id))}`);
      const adapterFile = path.join(getRoot(), "sync", "adapters", `${source.adapter}.ts`);
      if (!fs.existsSync(adapterFile)) console.log(`next: implement ${path.relative(getRoot(), adapterFile)} and register it in sync/adapters/index.ts`);
      return 0;
    }
    case "pause":
    case "resume":
    case "retire": {
      const { positionals, values } = parseArgs({ args: rest, options: { reason: { type: "string" } }, allowPositionals: true });
      const source = readSources().find((s) => s.id === positionals[0]);
      if (!source) throw new Error(`unknown source "${positionals[0]}"`);
      if (sub === "retire") {
        if (!values.reason) throw new Error("retire needs --reason");
        source.status = "retired";
        source.retiredAt = today;
        source.notes = [source.notes, `Retired ${today}: ${values.reason}`].filter(Boolean).join("\n");
      } else {
        source.status = sub === "pause" ? "paused" : "active";
      }
      writeSource(source);
      console.log(`${source.id} is now ${source.status}`);
      return 0;
    }
    default:
      console.error(usage);
      return 2;
  }
}
