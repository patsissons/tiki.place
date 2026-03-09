import { z } from "zod";

export const newBarSubmissionSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  country: z.string().min(2),
  notes: z.string().max(2000).optional().default(""),
  evidenceUrl: z.string().url().optional(),
  turnstileToken: z.string().min(1),
});

export const updateBarSubmissionSchema = z.object({
  placeId: z.string().min(1),
  reason: z.string().min(10).max(2000),
  turnstileToken: z.string().min(1),
});

export const reportBadBarSubmissionSchema = z.object({
  placeId: z.string().min(1),
  reason: z.string().min(10).max(2000),
  turnstileToken: z.string().min(1),
});

export type NewBarSubmission = z.infer<typeof newBarSubmissionSchema>;
export type UpdateBarSubmission = z.infer<typeof updateBarSubmissionSchema>;
export type ReportBadBarSubmission = z.infer<typeof reportBadBarSubmissionSchema>;
