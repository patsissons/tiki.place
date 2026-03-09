import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

import { createGitHubIssue, formatIssueSection, type IssuePayload } from "@/lib/github";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import type {
  NewBarSubmission,
  ReportBadBarSubmission,
  UpdateBarSubmission,
} from "@/lib/submission-schema";
import {
  newBarSubmissionSchema,
  reportBadBarSubmissionSchema,
  updateBarSubmissionSchema,
} from "@/lib/submission-schema";

type SubmissionKind = "new-bar" | "update-bar" | "report-bad";

const issueLabels: Record<SubmissionKind, string[]> = {
  "new-bar": ["submission:new-bar"],
  "update-bar": ["record:update"],
  "report-bad": ["record:report-bad"],
};

function getIpAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
}

function buildNewBarIssuePayload(submission: NewBarSubmission): IssuePayload {
  return {
    title: `New tiki bar submission: ${submission.name} (${submission.city}, ${submission.country})`,
    labels: issueLabels["new-bar"],
    body: [
      "## Automation payload",
      formatIssueSection("Bar name", submission.name),
      formatIssueSection("City", submission.city),
      formatIssueSection("Country", submission.country),
      formatIssueSection("Evidence URL", submission.evidenceUrl ?? ""),
      formatIssueSection("Notes", submission.notes ?? ""),
    ].join("\n"),
  };
}

function buildUpdateIssuePayload(
  kind: "update-bar" | "report-bad",
  submission: UpdateBarSubmission | ReportBadBarSubmission,
): IssuePayload {
  return {
    title:
      kind === "update-bar"
        ? `Refresh tiki bar record: ${submission.placeId}`
        : `Report invalid tiki bar record: ${submission.placeId}`,
    labels: issueLabels[kind],
    body: [
      "## Automation payload",
      formatIssueSection("Place ID", submission.placeId),
      formatIssueSection("Reason", submission.reason),
    ].join("\n"),
  };
}

export async function handleSubmission<T>({
  request,
  schema,
  kind,
}: {
  request: NextRequest;
  schema: ZodType<T>;
  kind: SubmissionKind;
}) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Invalid submission payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const ip = getIpAddress(request);
  const rateLimitResult = await enforceRateLimit(`submission:${ip}`);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        message: "Too many submissions. Try again later.",
      },
      { status: 429 },
    );
  }

  const turnstileToken = (parsed.data as { turnstileToken: string }).turnstileToken;
  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);

  if (!turnstileValid) {
    return NextResponse.json(
      {
        message: "Turnstile verification failed.",
      },
      { status: 400 },
    );
  }

  const issue = await createGitHubIssue(
    kind === "new-bar"
      ? buildNewBarIssuePayload(parsed.data as NewBarSubmission)
      : buildUpdateIssuePayload(
          kind,
          parsed.data as UpdateBarSubmission | ReportBadBarSubmission,
        ),
  );

  return NextResponse.json({
    message: `GitHub issue #${issue.number} created.`,
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  });
}

export {
  newBarSubmissionSchema,
  reportBadBarSubmissionSchema,
  updateBarSubmissionSchema,
};
