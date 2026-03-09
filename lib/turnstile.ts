import { env } from "@/lib/env";

type TurnstileResponse = {
  success: boolean;
};

export async function verifyTurnstileToken(token: string, ip?: string | null) {
  if (!env.turnstileSecretKey) {
    return token === "development-token" && process.env.NODE_ENV !== "production";
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: env.turnstileSecretKey,
      response: token,
      remoteip: ip ?? "",
    }),
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as TurnstileResponse;
  return result.success;
}
