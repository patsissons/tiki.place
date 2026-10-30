/**
 * Render Tiki Rat bar pages into data/snapshots/tikirat.json, with the owner's
 * permission and slowly: one page at a time, at least 3 s apart, no images or fonts.
 * Run by hand, never from CI. Resumable: rows younger than --refresh-days are kept.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getRoot, readObservations, readSources } from "@/lib/data/store";
import { parseBarPage, type FeedRow } from "./adapters/tikirat";

const MIN_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 5;

export async function snapshotTikirat(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { limit: { type: "string" }, "refresh-days": { type: "string", default: "30" } } });
  const source = readSources().find((s) => s.id === "tikirat");
  const relPath = source?.config.snapshot;
  if (typeof relPath !== "string") throw new Error("data/sources/tikirat.yml has no config.snapshot");
  const file = path.join(getRoot(), relPath);
  const rows = new Map<string, FeedRow>(fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as FeedRow[]).map((r) => [r.slug, r]) : []);
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sorted = [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    fs.writeFileSync(file, `[\n${sorted.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`);
  };

  const maxAgeMs = Number(values["refresh-days"]) * 86_400_000;
  const due = readObservations("tikirat")
    .filter((o) => {
      const fetched = rows.get(o.sourceRef)?.fetched_at;
      return !fetched || Date.now() - Date.parse(fetched) > maxAgeMs;
    })
    .slice(0, values.limit ? Number(values.limit) : undefined);
  console.log(`${due.length} bar page(s) due, ${rows.size} already in the snapshot`);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: source?.politeness?.userAgent ?? "tiki.place-bot/1.0 (+https://tiki.place/sources)" });
  const page = await context.newPage();
  await page.route("**/*", (route) => (["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));

  let failures = 0;
  let code = 0;
  try {
    for (const [i, obs] of due.entries()) {
      const started = Date.now();
      try {
        const res = await page.goto(obs.url!, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (res && [403, 429, 503].includes(res.status())) {
          console.error(`${res.status()} from tikirat.com; stopping so we do not hammer it`);
          code = 1;
          break;
        }
        await page.waitForFunction(() => document.querySelector('script[type="application/ld+json"]') && /FIND IT/.test(document.body.innerText), undefined, { timeout: 15_000 });
        const content = await page.evaluate(() => ({
          text: document.querySelector("main")?.innerText ?? "",
          ldJson: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
        }));
        const row = parseBarPage(obs.sourceRef, content, new Date().toISOString());
        if (!row) throw new Error("no bar data on the page");
        rows.set(row.slug, row);
        save();
        failures = 0;
        console.log(`[${i + 1}/${due.length}] ${row.slug}: ${row.name}, ${row.city ?? "?"} ${row.lat !== undefined ? "(coords)" : "(no coords)"}`);
      } catch (err) {
        failures++;
        console.warn(`[${i + 1}/${due.length}] ${obs.sourceRef}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`${failures} failures in a row; stopping`);
          code = 1;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_INTERVAL_MS - (Date.now() - started))));
    }
  } finally {
    await browser.close();
  }
  console.log(`snapshot holds ${rows.size} row(s): ${relPath}`);
  return code;
}
