import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

const memoryHits = new Map<string, { count: number; resetAt: number }>();

const redis =
  env.upstashRedisRestUrl && env.upstashRedisRestToken
    ? new Redis({
        url: env.upstashRedisRestUrl,
        token: env.upstashRedisRestToken,
      })
    : null;

const ratelimit =
  redis &&
  new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: true,
    prefix: "tiki-place-submissions",
  });

export async function enforceRateLimit(identifier: string) {
  if (ratelimit) {
    const result = await ratelimit.limit(identifier);
    return {
      success: result.success,
      resetAt: result.reset,
    };
  }

  const now = Date.now();
  const entry = memoryHits.get(identifier);
  if (!entry || now > entry.resetAt) {
    memoryHits.set(identifier, {
      count: 1,
      resetAt: now + 60 * 60 * 1000,
    });
    return {
      success: true,
      resetAt: now + 60 * 60 * 1000,
    };
  }

  if (entry.count >= 5) {
    return {
      success: false,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  return {
    success: true,
    resetAt: entry.resetAt,
  };
}
