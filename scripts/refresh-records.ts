import {
  commitSummary,
  getPlaceDetails,
  loadDatasetFromDisk,
  mapPlaceToBar,
  saveDatasetToDisk,
  upsertBar,
} from "./automation-lib";

async function main() {
  const dataset = await loadDatasetFromDisk();
  const failures: string[] = [];

  for (const bar of [...dataset.bars]) {
    try {
      const place = await getPlaceDetails(bar.placeId);
      upsertBar(dataset, mapPlaceToBar(place, bar));
    } catch (error) {
      failures.push(`${bar.name} (${bar.placeId}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await saveDatasetToDisk(dataset);
  await commitSummary(`Refreshed ${dataset.bars.length - failures.length} tiki bars.`);

  if (failures.length > 0) {
    await commitSummary("Failures:");
    for (const failure of failures) {
      await commitSummary(`- ${failure}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
