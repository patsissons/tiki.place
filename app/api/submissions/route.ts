import { NextResponse } from "next/server";
import { SubmissionSchema } from "@/lib/schema/submission";
import { verifyTurnstile } from "@/lib/turnstile";

const WINDOW_MS = 3_600_000;
const LIMIT = 5;
const recent = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  recent.set(ip, hits);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many submissions; try again later." }, { status: 429 });

  const parsed = SubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form." }, { status: 400 });
  const submission = parsed.data;

  if (!(await verifyTurnstile(submission.turnstileToken, ip))) return NextResponse.json({ error: "Verification failed; please retry." }, { status: 400 });

  const token = process.env.GITHUB_ISSUE_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER ?? "patsissons";
  const repo = process.env.GITHUB_REPO_NAME ?? "tiki.place";
  if (!token) return NextResponse.json({ error: "Submissions are not configured on this deployment." }, { status: 503 });

  const { turnstileToken: _t, ...payload } = submission;
  const title = `${submission.kind === "correction" ? "Correction" : "Submission"}: ${submission.name}, ${submission.city}`;
  const body = [
    submission.kind === "correction" ? `Correction for \`${submission.place ?? "?"}\`.` : "New place suggestion.",
    "",
    submission.note ? `> ${submission.note.replace(/\n/g, "\n> ")}` : "",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "_Filed from tiki.place/submit. The daily sync reads open `submission` issues as observations._",
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "tiki.place" },
    body: JSON.stringify({ title, body, labels: ["submission"] }),
  });
  if (!res.ok) return NextResponse.json({ error: "Could not file the submission right now." }, { status: 502 });
  const issue = (await res.json()) as { number: number; html_url: string };
  return NextResponse.json({ ok: true, number: issue.number, url: issue.html_url });
}
