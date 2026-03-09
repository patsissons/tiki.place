import { cache } from "react";
import fs from "node:fs/promises";
import path from "node:path";

import { parseTikiDataset, type TikiBar, type TikiDataset } from "@/lib/data-schema";

const dataPath = path.join(process.cwd(), "data.yml");

export const loadDataset = cache(async (): Promise<TikiDataset> => {
  const content = await fs.readFile(dataPath, "utf8");
  return parseTikiDataset(content);
});

export async function getTikiBars(): Promise<TikiBar[]> {
  const dataset = await loadDataset();
  return dataset.bars;
}

export function getDataPath() {
  return dataPath;
}
