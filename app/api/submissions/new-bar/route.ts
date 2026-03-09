import type { NextRequest } from "next/server";

import { handleSubmission, newBarSubmissionSchema } from "@/lib/submissions";

export async function POST(request: NextRequest) {
  return handleSubmission({
    request,
    schema: newBarSubmissionSchema,
    kind: "new-bar",
  });
}
