import { Octokit } from "@octokit/rest";

import { env, requireEnv } from "@/lib/env";

export type IssuePayload = {
  title: string;
  body: string;
  labels: string[];
};

function createOctokit(token: string) {
  return new Octokit({ auth: token });
}

export async function createGitHubIssue(payload: IssuePayload) {
  const token = requireEnv(env.githubIssueToken, "GITHUB_ISSUE_TOKEN");
  const owner = requireEnv(env.githubRepoOwner, "GITHUB_REPO_OWNER");
  const repo = requireEnv(env.githubRepoName, "GITHUB_REPO_NAME");
  const octokit = createOctokit(token);

  const issue = await octokit.issues.create({
    owner,
    repo,
    title: payload.title,
    body: payload.body,
    labels: payload.labels,
  });

  return issue.data;
}

export function formatIssueSection(title: string, value: string) {
  return `### ${title}\n${value.trim() || "_Not provided_"}\n`;
}
