const env = {
  nextPublicMapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  nextPublicMapboxStyle:
    process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/streets-v12",
  githubRepoOwner: process.env.GITHUB_REPO_OWNER,
  githubRepoName: process.env.GITHUB_REPO_NAME,
  githubIssueToken: process.env.GITHUB_ISSUE_TOKEN,
  githubActionsToken: process.env.GITHUB_ACTIONS_TOKEN,
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  turnstileSecretKey: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
  nextPublicTurnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
};

export function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export { env };
