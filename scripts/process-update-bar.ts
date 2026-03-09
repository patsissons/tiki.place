import {
  addLabels,
  AUTOMATION_PROCESSED_LABEL,
  commentOnIssue,
  commitSummary,
  getIssue,
  getIssueNumberFromEnv,
  getPlaceDetails,
  loadDatasetFromDisk,
  mapPlaceToBar,
  NEEDS_HUMAN_REVIEW_LABEL,
  parseIssueForm,
  saveDatasetToDisk,
  summarizePlace,
  upsertBar,
} from "./automation-lib";

async function main() {
  const issueNumber = getIssueNumberFromEnv();
  const issue = await getIssue(issueNumber);
  const fields = parseIssueForm(issue.body ?? "");
  const placeId = fields["Place ID"];

  if (!placeId) {
    await commentOnIssue(issueNumber, "Automation could not process this update because the issue is missing a Place ID.");
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
    return;
  }

  const dataset = await loadDatasetFromDisk();
  const existing = dataset.bars.find((bar) => bar.placeId === placeId);

  if (!existing) {
    await commentOnIssue(issueNumber, `Automation could not find Place ID \`${placeId}\` in \`data.yml\`.`);
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
    return;
  }

  const place = await getPlaceDetails(placeId);
  const refreshed = mapPlaceToBar(place, existing);

  await saveDatasetToDisk(upsertBar(dataset, refreshed));
  await commentOnIssue(
    issueNumber,
    [
      "Automation refreshed this tiki bar record from Google Places.",
      "",
      summarizePlace(place),
    ].join("\n"),
  );
  await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL]);
  await commitSummary(`Update issue #${issueNumber}: refreshed ${refreshed.name}`);
}

main().catch(async (error) => {
  const issueNumber = Number(process.env.ISSUE_NUMBER ?? "0");
  if (issueNumber) {
    await commentOnIssue(
      issueNumber,
      `Automation failed before completing this update.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
  }
  throw error;
});
