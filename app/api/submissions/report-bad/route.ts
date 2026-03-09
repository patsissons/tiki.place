import type { NextRequest } from "next/server";

import { handleSubmission, reportBadBarSubmissionSchema } from "@/lib/submissions";

export async function POST(request: NextRequest) {
  return handleSubmission({
    request,
    schema: reportBadBarSubmissionSchema,
    kind: "report-bad",
  });
}
