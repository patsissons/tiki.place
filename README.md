# tiki.place

Map-first web app for discovering tiki bars around the world.

## Stack

- Next.js App Router
- TypeScript + React
- Tailwind CSS + shadcn-style components
- Mapbox GL JS
- YAML-backed frozen dataset in `data.yml`
- GitHub issues + GitHub Actions for dataset change management

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the required keys:
   - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
   - `GOOGLE_PLACES_API_KEY`
   - `GITHUB_REPO_OWNER`
   - `GITHUB_REPO_NAME`
   - `GITHUB_ISSUE_TOKEN`
   - `CLOUDFLARE_TURNSTILE_SECRET_KEY`
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Install dependencies with `pnpm install`.
4. Start the app with `pnpm dev`.

## Scripts

- `pnpm dev`: run the local app
- `pnpm build`: production build
- `pnpm lint`: lint the repo
- `pnpm typecheck`: TypeScript check
- `pnpm test`: unit/integration tests
- `pnpm test:e2e`: Playwright tests
- `pnpm automation:new-bar`: process a labeled new-bar issue
- `pnpm automation:update-bar`: refresh an existing record from a labeled issue
- `pnpm automation:report-bad`: research a bad-record report and comment a recommendation
- `pnpm automation:refresh-records`: weekly/manual bulk refresh of `data.yml`

## Data flow

- Public users explore bars from `data.yml`.
- New bars, refresh requests, and bad-record reports are submitted through in-app forms or GitHub issue forms.
- GitHub Actions process labeled issues.
- Successful automated changes update `data.yml` directly on `main`.
- Bad-record reports always stop at a recommendation comment for human review.

## Verification

Current local verification:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm lint`
