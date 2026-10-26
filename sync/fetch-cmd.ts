/** `pnpm sync fetch <url> [--save path]`: fetch one page politely, e.g. to capture a fixture. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getRoot } from "@/lib/data/store";
import { createPoliteFetch } from "./core/fetch";

export async function fetchCommand(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { save: { type: "string" }, "user-agent": { type: "string", default: "tiki.place-bot/1.0 (+https://tiki.place/sources)" } },
    allowPositionals: true,
  });
  const url = positionals[0];
  if (!url) throw new Error("usage: pnpm sync fetch <url> [--save path]");
  const fetch = createPoliteFetch({ cacheDir: path.join(getRoot(), ".cache", "fetch", "manual"), userAgent: values["user-agent"], minIntervalMs: 2000 });
  const res = await fetch(url);
  console.error(`${res.status} ${res.fromCache ? "(cache)" : ""} ${res.headers["content-type"] ?? ""} ${res.body.length} bytes`);
  if (values.save) {
    fs.mkdirSync(path.dirname(values.save), { recursive: true });
    fs.writeFileSync(values.save, res.body);
    console.error(`saved to ${values.save}`);
  } else {
    process.stdout.write(res.body);
  }
  return res.status >= 400 ? 1 : 0;
}
