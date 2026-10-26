import { parseArgs } from "node:util";
import { runEngine } from "./core/engine";

export async function runSync(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
      offline: { type: "boolean", default: false },
      "skip-verify": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      report: { type: "boolean", default: true },
    },
  });
  const result = await runEngine({
    sourceFilter: values.source && values.source.length > 0 ? values.source : undefined,
    dryRun: values["dry-run"],
    offline: values.offline,
    skipVerify: values["skip-verify"],
    force: values.force,
  });
  if (values.report) console.log(`\n${result.report}`);
  return result.code;
}
