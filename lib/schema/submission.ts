import { z } from "zod";

/** What the /submit form sends and what gets embedded in the GitHub issue. */
export const SubmissionSchema = z.strictObject({
  kind: z.enum(["new", "correction"]),
  /** Slug of the place being corrected, when kind = correction. */
  place: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80).optional(),
  country: z.string().trim().min(2).max(60),
  website: z.string().trim().max(300).optional(),
  status: z.enum(["open", "temporarily_closed", "closed", "coming_soon"]).optional(),
  note: z.string().trim().max(2000).optional(),
  turnstileToken: z.string().optional(),
});
export type Submission = z.infer<typeof SubmissionSchema>;
