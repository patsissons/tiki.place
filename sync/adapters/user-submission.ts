/**
 * Reader submissions: open GitHub issues labelled `submission`, each carrying a
 * fenced JSON block written by /api/submissions. The submitter vouches for
 * tiki-ness (tiki-directory tag) at the source's modest tikiSignal, so a
 * submission only auto-publishes when another source corroborates it.
 */
import { z } from "zod";
import { SubmissionSchema } from "@/lib/schema/submission";
import type { Observation } from "@/lib/schema";
import { countryCode } from "./tikirat";
import type { Adapter, AdapterContext, DiscoverResult } from "./types";
import { makeObservation, reconcileObservations, safeUrl } from "./types";

const ConfigSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  label: z.string().default("submission"),
});

const IssueSchema = z.looseObject({ number: z.number(), html_url: z.string(), body: z.string().nullable(), state: z.string() });

export function parseIssue(issue: z.infer<typeof IssueSchema>, sourceId: string, observedAt: string): Observation | null {
  const m = issue.body?.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]!);
  } catch {
    return null;
  }
  const sub = SubmissionSchema.omit({ turnstileToken: true }).safeParse(parsed);
  if (!sub.success) return null;
  const s = sub.data;
  return makeObservation({
    sourceId,
    sourceRef: `issue-${issue.number}`,
    url: issue.html_url,
    name: s.name,
    address: { locality: s.city, region: s.region, country: countryCode(s.country) },
    coords: null,
    coordsPrecision: "none",
    website: safeUrl(s.website),
    statusHint: s.status ?? null,
    tags: ["tiki-directory"],
    observedAt,
  });
}

export const userSubmissionAdapter: Adapter = {
  id: "user-submission",
  async discover(ctx: AdapterContext): Promise<DiscoverResult> {
    const config = ConfigSchema.parse(ctx.source.config);
    const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_ISSUE_TOKEN;
    const url = `https://api.github.com/repos/${config.repo}/issues?state=open&labels=${encodeURIComponent(config.label)}&per_page=100`;
    const res = await ctx.fetch(url, { accept: "application/vnd.github+json", headers: token ? { authorization: `Bearer ${token}` } : {}, ignoreRobots: true });
    if (res.status !== 200) throw new Error(`github issues returned ${res.status}`);
    const issues = z.array(IssueSchema).parse(JSON.parse(res.body));
    const observedAt = ctx.now.toISOString();
    const fresh = issues.map((i) => parseIssue(i, ctx.source.id, observedAt)).filter((o): o is Observation => o !== null);
    // Closed issues keep their prior observations (complete = false), so approvals stay attached.
    return { observations: reconcileObservations(ctx.prior, fresh), complete: false };
  },
};
