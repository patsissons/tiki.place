#!/usr/bin/env tsx
/**
 * tiki.place data CLI.
 *
 *   pnpm sync run [--source id] [--dry-run] [--offline] [--skip-verify] [--force] [--include-manual]
 *   pnpm sync snapshot-tikirat [--limit n] [--refresh-days n]   slowly render bar pages into a snapshot
 *   pnpm sync fmt                      rewrite every data file in canonical form
 *   pnpm validate                      parse + invariants + canonical-form check
 *   pnpm data:build [--check]          generate public/data/*
 *   pnpm review <subcommand>           triage candidates (see sync/review.ts)
 *   pnpm source <subcommand>           add / retire sources
 */
import { parseArgs } from "node:util";
import { writePublicData } from "./core/publish";
import { validateData } from "./core/validate";

type Command = (argv: string[]) => Promise<number | void> | number | void;

const commands: Record<string, Command> = {
  async validate() {
    const { problems, places } = validateData();
    if (problems.length) {
      for (const p of problems) console.error(`✗ ${p.file}: ${p.message}`);
      console.error(`\n${problems.length} problem(s) in ${places.length} place file(s).`);
      return 1;
    }
    console.log(`✓ data valid: ${places.length} places, ${places.filter((p) => p.review.state !== "rejected").length} active`);
  },

  async "data:build"(argv) {
    const { values } = parseArgs({ args: argv, options: { check: { type: "boolean", default: false } } });
    const { manifest, outDir } = writePublicData({ check: values.check });
    console.log(`${values.check ? "✓ would write" : "✓ wrote"} ${manifest.count} published places (${manifest.hash}) to ${outDir}`);
  },

  async fmt() {
    const { formatAll } = await import("./core/fmt");
    const changed = formatAll();
    console.log(changed.length ? `reformatted:\n  ${changed.join("\n  ")}` : "all files already canonical");
  },

  async run(argv) {
    const { runSync } = await import("./run");
    return runSync(argv);
  },

  async review(argv) {
    const { reviewCommand } = await import("./review");
    return reviewCommand(argv);
  },

  async source(argv) {
    const { sourceCommand } = await import("./source");
    return sourceCommand(argv);
  },

  async "snapshot-tikirat"(argv) {
    const { snapshotTikirat } = await import("./snapshot-tikirat");
    return snapshotTikirat(argv);
  },

  async fetch(argv) {
    const { fetchCommand } = await import("./fetch-cmd");
    return fetchCommand(argv);
  },
};

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const command = name ? commands[name] : undefined;
  if (!command) {
    console.error(`usage: sync <${Object.keys(commands).join("|")}> [options]`);
    process.exit(2);
  }
  const code = await command(rest);
  process.exit(typeof code === "number" ? code : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
