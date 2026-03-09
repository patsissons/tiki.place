import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github", () => ({
  createGitHubIssue: vi.fn(),
  formatIssueSection: (title: string, value: string) => `### ${title}\n${value}\n`,
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
}));

import { createGitHubIssue } from "@/lib/github";
import { enforceRateLimit } from "@/lib/rate-limit";
import { handleSubmission, newBarSubmissionSchema } from "@/lib/submissions";
import { verifyTurnstileToken } from "@/lib/turnstile";

describe("handleSubmission", () => {
  beforeEach(() => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ success: true, resetAt: Date.now() + 1000 });
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    vi.mocked(createGitHubIssue).mockResolvedValue({
      number: 42,
      html_url: "https://github.com/example/repo/issues/42",
    } as Awaited<ReturnType<typeof createGitHubIssue>>);
  });

  it("rejects invalid payloads", async () => {
    const request = new NextRequest("http://localhost/api/submissions/new-bar", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleSubmission({
      request,
      schema: newBarSubmissionSchema,
      kind: "new-bar",
    });

    expect(response.status).toBe(400);
  });

  it("rejects rate limited requests", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ success: false, resetAt: Date.now() + 1000 });

    const request = new NextRequest("http://localhost/api/submissions/new-bar", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Tiki",
        city: "San Diego",
        country: "United States",
        turnstileToken: "token",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleSubmission({
      request,
      schema: newBarSubmissionSchema,
      kind: "new-bar",
    });

    expect(response.status).toBe(429);
  });

  it("rejects turnstile failures", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false);

    const request = new NextRequest("http://localhost/api/submissions/new-bar", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Tiki",
        city: "San Diego",
        country: "United States",
        turnstileToken: "token",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleSubmission({
      request,
      schema: newBarSubmissionSchema,
      kind: "new-bar",
    });

    expect(response.status).toBe(400);
  });

  it("creates a labeled GitHub issue on success", async () => {
    const request = new NextRequest("http://localhost/api/submissions/new-bar", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Tiki",
        city: "San Diego",
        country: "United States",
        notes: "Near the boardwalk",
        evidenceUrl: "https://example.com",
        turnstileToken: "token",
      }),
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    });

    const response = await handleSubmission({
      request,
      schema: newBarSubmissionSchema,
      kind: "new-bar",
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.issueNumber).toBe(42);
    expect(createGitHubIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ["submission:new-bar"],
        title: expect.stringContaining("Test Tiki"),
      }),
    );
  });
});
