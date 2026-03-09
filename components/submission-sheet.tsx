"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";

import { env } from "@/lib/env";
import type { TikiBar } from "@/lib/data-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/turnstile-widget";

type SubmissionMode = "new" | "update" | "report-bad";

type SubmissionSheetProps = {
  mode: SubmissionMode | null;
  bar?: TikiBar;
  onOpenChange: (open: boolean) => void;
};

const endpointByMode: Record<SubmissionMode, string> = {
  new: "/api/submissions/new-bar",
  update: "/api/submissions/update-bar",
  "report-bad": "/api/submissions/report-bad",
};

export function SubmissionSheet({ mode, bar, onOpenChange }: SubmissionSheetProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [formState, setFormState] = useState({
    name: "",
    city: "",
    country: "",
    notes: "",
    evidenceUrl: "",
    reason: "",
  });

  const open = mode !== null;

  const title = useMemo(() => {
    switch (mode) {
      case "new":
        return "Submit a new tiki bar";
      case "update":
        return "Request a record refresh";
      case "report-bad":
        return "Report a bad tiki record";
      default:
        return "";
    }
  }, [mode]);

  const description = useMemo(() => {
    switch (mode) {
      case "new":
        return "Give the automation enough detail to uniquely identify the bar through Google Places.";
      case "update":
        return "Explain what looks stale so automation can refresh the record and leave a paper trail.";
      case "report-bad":
        return "Describe why this record should be reviewed as a non-tiki or invalid venue.";
      default:
        return "";
    }
  }, [mode]);

  const effectiveTurnstileToken =
    turnstileToken || (!env.nextPublicTurnstileSiteKey && process.env.NODE_ENV !== "production" ? "development-token" : "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) {
      return;
    }

    setStatus(null);

    if (!effectiveTurnstileToken) {
      setStatus("Complete the Turnstile challenge before submitting.");
      return;
    }

    const payload =
      mode === "new"
        ? {
            name: formState.name,
            city: formState.city,
            country: formState.country,
            notes: formState.notes,
            evidenceUrl: formState.evidenceUrl || undefined,
            turnstileToken: effectiveTurnstileToken,
          }
        : {
            placeId: bar?.placeId ?? "",
            reason: formState.reason,
            turnstileToken: effectiveTurnstileToken,
          };

    startTransition(async () => {
      const response = await fetch(endpointByMode[mode], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(result.message ?? "Submission failed.");
        return;
      }

      setStatus(result.message ?? "Issue created.");
      setTurnstileToken("");
      setFormState({
        name: "",
        city: "",
        country: "",
        notes: "",
        evidenceUrl: "",
        reason: "",
      });
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {mode === "new" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="submission-name">Bar name</Label>
                <Input
                  id="submission-name"
                  value={formState.name}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="submission-city">City</Label>
                  <Input
                    id="submission-city"
                    value={formState.city}
                    onChange={(event) => setFormState((current) => ({ ...current, city: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="submission-country">Country</Label>
                  <Input
                    id="submission-country"
                    value={formState.country}
                    onChange={(event) => setFormState((current) => ({ ...current, country: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-evidence">Evidence URL</Label>
                <Input
                  id="submission-evidence"
                  type="url"
                  placeholder="https://..."
                  value={formState.evidenceUrl}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, evidenceUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-notes">Notes</Label>
                <Textarea
                  id="submission-notes"
                  value={formState.notes}
                  onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-3xl border border-border bg-white/80 p-4 text-sm">
                <p className="font-semibold">{bar?.name}</p>
                <p className="mt-1 text-muted-foreground">{bar?.formattedAddress}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">{bar?.placeId}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-reason">Reason</Label>
                <Textarea
                  id="submission-reason"
                  value={formState.reason}
                  onChange={(event) => setFormState((current) => ({ ...current, reason: event.target.value }))}
                  required
                />
              </div>
            </>
          )}

          <TurnstileWidget onToken={setTurnstileToken} />

          <div className="space-y-3">
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit to GitHub workflow
            </Button>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
