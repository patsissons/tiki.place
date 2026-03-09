import {
  addLabels,
  AUTOMATION_PROCESSED_LABEL,
  chooseUniquePlaceMatch,
  commentOnIssue,
  commitSummary,
  getIssue,
  getIssueNumberFromEnv,
  loadDatasetFromDisk,
  mapPlaceToBar,
  NEEDS_HUMAN_REVIEW_LABEL,
  parseIssueForm,
  saveDatasetToDisk,
  searchPlaces,
  summarizePlace,
  upsertBar,
} from "./automation-lib";

async function main() {
  const issueNumber = getIssueNumberFromEnv();
  const issue = await getIssue(issueNumber);
  const fields = parseIssueForm(issue.body ?? "");

  const submittedName = fields["Bar name"];
  const city = fields.City;
  const country = fields.Country;

  if (!submittedName || !city || !country) {
    await commentOnIssue(
      issueNumber,
      "Automation could not process this submission because the issue body is missing the bar name, city, or country.",
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
    return;
  }

  const candidates = await searchPlaces(`${submittedName} ${city} ${country} tiki bar`);
  const match = chooseUniquePlaceMatch(submittedName, city, country, candidates);

  if (!match.place) {
    await commentOnIssue(issueNumber, `Automation could not add this bar automatically.\n\nReason: ${match.reason}`);
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
    await commitSummary(`New-bar issue #${issueNumber}: ${match.reason}`);
    return;
  }

  const dataset = await loadDatasetFromDisk();
  if (dataset.bars.some((bar) => bar.placeId === match.place?.id)) {
    await commentOnIssue(
      issueNumber,
      `Automation skipped this submission because Place ID \`${match.place.id}\` already exists in \`data.yml\`.`,
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL]);
    await commitSummary(`New-bar issue #${issueNumber}: duplicate Place ID ${match.place.id}`);
    return;
  }

  const nextBar = mapPlaceToBar(match.place);
  const nextDataset = upsertBar(dataset, nextBar);
  await saveDatasetToDisk(nextDataset);

  await commentOnIssue(
    issueNumber,
    [
      "Automation added this tiki bar to `data.yml`.",
      "",
      summarizePlace(match.place),
    ].join("\n"),
  );
  await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL]);
  await commitSummary(`New-bar issue #${issueNumber}: added ${nextBar.name}`);
}

main().catch(async (error) => {
  const issueNumber = Number(process.env.ISSUE_NUMBER ?? "0");
  if (issueNumber) {
    await commentOnIssue(
      issueNumber,
      `Automation failed before completing this submission.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
  }
  throw error;
});
