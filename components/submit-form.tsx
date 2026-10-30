"use client";

import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; theme?: string }) => string; reset: (id: string) => void };
  }
}

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; url: string } | { kind: "error"; message: string };

export function SubmitForm({ siteKey }: { siteKey?: string }) {
  const params = useSearchParams();
  const place = params.get("place") ?? undefined;
  const [state, setState] = useState<State>({ kind: "idle" });
  const [token, setToken] = useState<string | undefined>();
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const renderWidget = () => {
    if (!siteKey || !widget.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(widget.current, { sitekey: siteKey, callback: setToken, theme: "dark" });
  };
  useEffect(renderWidget);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { kind: place ? "correction" : "new", place, turnstileToken: token };
    for (const key of ["name", "city", "region", "country", "website", "status", "note"]) {
      const v = String(form.get(key) ?? "").trim();
      if (v) payload[key] = v;
    }
    setState({ kind: "sending" });
    const res = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && json.url) setState({ kind: "done", url: json.url });
    else {
      setState({ kind: "error", message: json.error ?? "Something went wrong." });
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-2xl border border-amber/40 bg-amber/8 p-6">
        <h2 className="font-display text-2xl font-semibold">Mahalo!</h2>
        <p className="mt-2 text-fg-muted">
          Your suggestion is filed as{" "}
          <a className="text-seaglass hover:underline" href={state.url} target="_blank" rel="noopener noreferrer">
            a public issue
          </a>
          . The next sync will pick it up and a person will review it.
        </p>
      </div>
    );
  }

  const field = "space-y-1.5";
  const label = "text-xs font-semibold uppercase tracking-wider text-fg-muted";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onLoad={renderWidget} />}
      {place && (
        <p className="rounded-xl border border-line bg-bg-elevated/60 px-4 py-3 text-sm">
          Correcting <span className="font-mono">{place}</span>. Fill in what should change.
        </p>
      )}
      <div className={field}>
        <label className={label} htmlFor="name">Bar name</label>
        <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Smuggler's Cove" />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className={field}>
          <label className={label} htmlFor="city">City</label>
          <Input id="city" name="city" required minLength={2} placeholder="San Francisco" />
        </div>
        <div className={field}>
          <label className={label} htmlFor="region">State / region</label>
          <Input id="region" name="region" placeholder="California" />
        </div>
        <div className={field}>
          <label className={label} htmlFor="country">Country</label>
          <Input id="country" name="country" required minLength={2} placeholder="United States" />
        </div>
      </div>
      <div className={field}>
        <label className={label} htmlFor="website">Website (optional)</label>
        <Input id="website" name="website" type="url" placeholder="https://" />
      </div>
      <div className={field}>
        <label className={label} htmlFor="status">Status</label>
        <select id="status" name="status" className="h-10 w-full rounded-full border border-line bg-bg-raised/60 px-4 text-sm" defaultValue="">
          <option value="">Not sure</option>
          <option value="open">Open</option>
          <option value="coming_soon">Coming soon</option>
          <option value="temporarily_closed">Temporarily closed</option>
          <option value="closed">Closed permanently</option>
        </select>
      </div>
      <div className={field}>
        <label className={label} htmlFor="note">Anything else (optional)</label>
        <textarea id="note" name="note" maxLength={2000} rows={4} className="w-full rounded-2xl border border-line bg-bg-raised/60 px-4 py-3 text-sm placeholder:text-fg-muted/70 focus:border-amber/60 focus:outline-none" placeholder="How you know, a link, what changed…" />
      </div>
      {siteKey && <div ref={widget} />}
      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" size="lg" disabled={state.kind === "sending" || (Boolean(siteKey) && !token)}>
          {state.kind === "sending" ? "Sending…" : "Send suggestion"}
        </Button>
        <span className={cn("text-sm", state.kind === "error" ? "text-coral" : "text-fg-muted")}>{state.kind === "error" ? state.message : "Filed as a public GitHub issue."}</span>
      </div>
    </form>
  );
}
