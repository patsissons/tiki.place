"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

import { env } from "@/lib/env";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
};

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const widgetIdRef = useRef<string | null>(null);
  const containerId = useId().replace(/:/g, "");
  const siteKey = env.nextPublicTurnstileSiteKey;

  useEffect(() => {
    if (!siteKey || !window.turnstile) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
      sitekey: siteKey,
      theme: "light",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(""),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [containerId, onToken, siteKey]);

  if (!siteKey) {
    return (
      <div className="flex justify-center">
        <div className="rounded-3xl border border-dashed border-border bg-white/60 p-4 text-sm text-muted-foreground">
          Turnstile is not configured locally. Development submissions will use a local bypass token.
        </div>
      </div>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div className="flex justify-center">
        <div id={containerId} className="min-h-16" />
      </div>
    </>
  );
}
