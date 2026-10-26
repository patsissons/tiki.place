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

function parseRobots(text: string, userAgent: string): string[] {
  // Minimal: collect Disallow rules for the most specific matching agent group ("*" or our token).
  const token = userAgent.split("/")[0]!.toLowerCase();
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k!.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  return (specific ?? wildcard)?.disallow ?? [];
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
  const robots = new Map<string, string[]>();
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

  async function rawRequest(url: string, headers: Record<string, string>): Promise<Response> {
    const host = new URL(url).host;
    if (requests >= maxRequests) throw new RequestBudgetExhausted(host);
    const last = lastRequestAt.get(host) ?? 0;
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    requests += 1;
    lastRequestAt.set(host, Date.now());
    return fetchImpl(url, { headers: { "user-agent": userAgent, ...headers }, redirect: "follow" });
  }

  async function allowedByRobots(url: string): Promise<boolean> {
    if (!respectRobots) return true;
    const { origin, pathname } = new URL(url);
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
    return !rules.some((rule) => pathname.startsWith(rule));
  }

  const politeFetch = async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<FetchResult> {
    const cached = readCache(url);
    const ttl = opts.cacheTtlMs ?? 0;
    if (cached && ttl > 0 && Date.now() - Date.parse(cached.fetchedAt) < ttl) return { ...cached, fromCache: true };
    if (offline) {
      if (cached) return { ...cached, fromCache: true };
      throw new Error(`offline and not cached: ${url}`);
    }
    if (!(await allowedByRobots(url))) throw new RobotsDisallowed(url);

    const headers: Record<string, string> = { accept: opts.accept ?? "text/html,application/xml,application/json;q=0.9,*/*;q=0.8", ...opts.headers };
    if (cached?.headers.etag) headers["if-none-match"] = cached.headers.etag;
    if (cached?.headers["last-modified"]) headers["if-modified-since"] = cached.headers["last-modified"];

    const res = await rawRequest(url, headers);
    if (res.status === 304 && cached) {
      const refreshed = { ...cached, fetchedAt: now().toISOString() };
      writeCache(refreshed);
      return { ...refreshed, fromCache: true };
    }
    const body = await res.text();
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
