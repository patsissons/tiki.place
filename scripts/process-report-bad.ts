import {
  addLabels,
  AUTOMATION_PROCESSED_LABEL,
  commentOnIssue,
  commitSummary,
  evaluateBadReport,
  getIssue,
  getIssueNumberFromEnv,
  getPlaceDetails,
  NEEDS_HUMAN_REVIEW_LABEL,
  parseIssueForm,
  summarizePlace,
} from "./automation-lib";

async function main() {
  const issueNumber = getIssueNumberFromEnv();
  const issue = await getIssue(issueNumber);
  const fields = parseIssueForm(issue.body ?? "");
  const placeId = fields["Place ID"];
  const reason = fields.Reason;

  if (!placeId || !reason) {
    await commentOnIssue(
      issueNumber,
      "Automation could not process this report because the issue body is missing the Place ID or report reason.",
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
    return;
  }

  let place = null;
  try {
    place = await getPlaceDetails(placeId);
  } catch {
    place = null;
  }

  const evaluation = evaluateBadReport(place, reason);
  const summary = place ? summarizePlace(place) : "- Google Places no longer returns this Place ID.";

  await commentOnIssue(
    issueNumber,
    [
      `Automation recommendation: **${evaluation.recommendation.toUpperCase()}**`,
      "",
      ...evaluation.rationale.map((line) => `- ${line}`),
      "",
      "Research summary:",
      summary,
      "",
      "This workflow never removes records automatically. A maintainer should review and decide.",
    ].join("\n"),
  );
  await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
  await commitSummary(`Bad-record issue #${issueNumber}: ${evaluation.recommendation}`);
}

main().catch(async (error) => {
  const issueNumber = Number(process.env.ISSUE_NUMBER ?? "0");
  if (issueNumber) {
    await commentOnIssue(
      issueNumber,
      `Automation failed before completing this report.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
    );
    await addLabels(issueNumber, [AUTOMATION_PROCESSED_LABEL, NEEDS_HUMAN_REVIEW_LABEL]);
  }
  throw error;
});
