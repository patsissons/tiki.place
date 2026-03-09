import type { NextRequest } from "next/server";

import { handleSubmission, updateBarSubmissionSchema } from "@/lib/submissions";

export async function POST(request: NextRequest) {
  return handleSubmission({
    request,
    schema: updateBarSubmissionSchema,
    kind: "update-bar",
  });
}
