/**
 * Polite HTTP client for source adapters: per-host spacing, robots.txt,
 * conditional requests and an on-disk cache under .cache/fetch.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type FetchResult = {
  url: string;
  status: number;
  body: string;
  fromCache: boolean;
  fetchedAt: string;
  headers: Record<string, string>;
};

type CacheEntry = Omit<FetchResult, "fromCache">;

export type PoliteFetchOptions = {
  /** Reuse a cached body younger than this without a request. 0 = always revalidate. */
  cacheTtlMs?: number;
  /** Abort the request after this long (default 60 s). */
  timeoutMs?: number;
  /** For query APIs (e.g. Overpass) whose robots.txt targets crawlers, not clients. Rate limits still apply. */
  ignoreRobots?: boolean;
  accept?: string;
  headers?: Record<string, string>;
};

export interface PoliteFetch {
  (url: string, options?: PoliteFetchOptions): Promise<FetchResult>;
  readonly requests: number;
  readonly remaining: number;
}

export class RequestBudgetExhausted extends Error {
  constructor(public readonly host: string) {
    super(`request budget exhausted for ${host}`);
  }
}

export class RobotsDisallowed extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

/** The host asked us to slow down (429/503). The fetcher refuses further requests to it for this run. */
export class SourceThrottled extends Error {
  constructor(
    public readonly host: string,
    public readonly status: number,
    public readonly retryAfterS?: number,
  ) {
    super(`${host} returned ${status}${retryAfterS !== undefined ? ` (Retry-After ${retryAfterS}s)` : ""}; stopping requests to it`);
  }
}

/** A bot challenge (e.g. Cloudflare "Just a moment..."). Never retried or solved; the run stops for that host. */
export class ChallengeDetected extends Error {
  constructor(public readonly host: string) {
    super(`${host} served a bot challenge; stopping requests to it`);
  }
}

const CHALLENGE_MARKERS = [/<title>\s*Just a moment\.\.\.\s*<\/title>/i, /challenges\.cloudflare\.com/i, /cf-chl-/i, /Attention Required! \| Cloudflare/i];

export function looksLikeChallenge(status: number, headers: Headers | Record<string, string>, body: string): boolean {
  const get = (h: string) => (headers instanceof Headers ? headers.get(h) : headers[h]) ?? undefined;
  if (get("cf-mitigated") === "challenge") return true;
  const head = body.slice(0, 20_000);
  // A 200 page may embed a Turnstile widget legitimately; only the interstitial title counts there.
  if (status === 200) return CHALLENGE_MARKERS[0]!.test(head);
  if (status !== 403 && status !== 503) return false;
  return CHALLENGE_MARKERS.some((re) => re.test(head));
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

export type CreatePoliteFetchOptions = {
  cacheDir: string;
  userAgent: string;
  minIntervalMs?: number;
  maxRequests?: number;
  /** Never hit the network; serve from cache or throw. */
  offline?: boolean;
  respectRobots?: boolean;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type RobotsRule = { allow: boolean; path: string };

export function parseRobots(text: string, userAgent: string): RobotsRule[] {
  // Collect Allow/Disallow rules for the most specific matching agent group ("*" or our token).
  const token = userAgent.split("/")[0]!.toLowerCase();
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k!.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && current) {
      if (value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  return (specific ?? wildcard)?.rules ?? [];
}

function ruleMatches(rule: string, target: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp(`^${body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return re.test(target);
}

/** RFC 9309: the longest matching rule wins; on a tie, Allow wins. No match means allowed. */
export function robotsAllows(rules: RobotsRule[], target: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, target)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export function createPoliteFetch(options: CreatePoliteFetchOptions): PoliteFetch {
  const {
    cacheDir,
    userAgent,
    minIntervalMs = 1000,
    maxRequests = Infinity,
    offline = false,
    respectRobots = true,
    fetchImpl = fetch,
    sleep = defaultSleep,
    now = () => new Date(),
  } = options;

  const lastRequestAt = new Map<string, number>();
  /** Hosts that throttled or challenged us this run: no further requests. */
  const stopped = new Map<string, Error>();
  const robots = new Map<string, RobotsRule[]>();
  let requests = 0;

  const cachePath = (url: string) => path.join(cacheDir, `${createHash("sha1").update(url).digest("hex")}.json`);
  const readCache = (url: string): CacheEntry | null => {
    try {
      return JSON.parse(fs.readFileSync(cachePath(url), "utf8")) as CacheEntry;
    } catch {
      return null;
    }
  };
  const writeCache = (entry: CacheEntry) => {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath(entry.url), JSON.stringify(entry));
  };

  async function rawRequest(url: string, headers: Record<string, string>, timeoutMs = 60_000): Promise<Response> {
    const host = new URL(url).host;
    const halt = stopped.get(host);
    if (halt) throw halt;
    if (requests >= maxRequests) throw new RequestBudgetExhausted(host);
    const last = lastRequestAt.get(host) ?? 0;
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    requests += 1;
    lastRequestAt.set(host, Date.now());
    return fetchImpl(url, { headers: { "user-agent": userAgent, ...headers }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  }

  async function allowedByRobots(url: string): Promise<boolean> {
    if (!respectRobots) return true;
    const { origin, pathname, search } = new URL(url);
    if (pathname === "/robots.txt") return true;
    let rules = robots.get(origin);
    if (!rules) {
      try {
        const cached = readCache(`${origin}/robots.txt`);
        let text: string;
        if (cached && Date.now() - Date.parse(cached.fetchedAt) < 24 * 3600 * 1000) text = cached.body;
        else if (offline) text = cached?.body ?? "";
        else {
          const res = await rawRequest(`${origin}/robots.txt`, {});
          text = res.ok ? await res.text() : "";
          writeCache({ url: `${origin}/robots.txt`, status: res.status, body: text, fetchedAt: now().toISOString(), headers: {} });
        }
        rules = parseRobots(text, userAgent);
      } catch {
        rules = [];
      }
      robots.set(origin, rules);
    }
    return robotsAllows(rules, pathname + search);
  }

  const politeFetch = async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<FetchResult> {
    const cached = readCache(url);
    const ttl = opts.cacheTtlMs ?? 0;
    if (cached && ttl > 0 && Date.now() - Date.parse(cached.fetchedAt) < ttl) return { ...cached, fromCache: true };
    if (offline) {
      if (cached) return { ...cached, fromCache: true };
      throw new Error(`offline and not cached: ${url}`);
    }
    if (!opts.ignoreRobots && !(await allowedByRobots(url))) throw new RobotsDisallowed(url);

    const headers: Record<string, string> = { accept: opts.accept ?? "text/html,application/xml,application/json;q=0.9,*/*;q=0.8", ...opts.headers };
    if (cached?.headers.etag) headers["if-none-match"] = cached.headers.etag;
    if (cached?.headers["last-modified"]) headers["if-modified-since"] = cached.headers["last-modified"];

    const res = await rawRequest(url, headers, opts.timeoutMs);
    if (res.status === 304 && cached) {
      const refreshed = { ...cached, fetchedAt: now().toISOString() };
      writeCache(refreshed);
      return { ...refreshed, fromCache: true };
    }
    const body = await res.text();
    const host = new URL(url).host;
    if (looksLikeChallenge(res.status, res.headers, body)) {
      const err = new ChallengeDetected(host);
      stopped.set(host, err);
      throw err;
    }
    if (res.status === 429 || res.status === 503) {
      const err = new SourceThrottled(host, res.status, retryAfterSeconds(res.headers.get("retry-after")));
      stopped.set(host, err);
      throw err;
    }
    const keep: Record<string, string> = {};
    for (const h of ["etag", "last-modified", "content-type"]) {
      const v = res.headers.get(h);
      if (v) keep[h] = v;
    }
    const entry: CacheEntry = { url, status: res.status, body, fetchedAt: now().toISOString(), headers: keep };
    if (res.ok) writeCache(entry);
    return { ...entry, fromCache: false };
  } as PoliteFetch;

  Object.defineProperties(politeFetch, {
    requests: { get: () => requests },
    remaining: { get: () => (Number.isFinite(maxRequests) ? maxRequests - requests : Infinity) },
  });
  return politeFetch;
}
