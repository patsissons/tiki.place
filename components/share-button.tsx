"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = Omit<ButtonProps, "onClick" | "children"> & {
  /** Site-relative path to share, e.g. "/places/<id>". Resolved against the current origin. */
  path: string;
  title: string;
  text?: string;
};

/** Shares the canonical permalink with the native share sheet, or copies it when there is none. */
export function ShareButton({ path, title, text, ...props }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Fall through to the clipboard when the share sheet is unavailable.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <Button type="button" onClick={share} aria-live="polite" {...props}>
      {copied ? <Check /> : <Share2 />} {copied ? "Copied" : "Share"}
    </Button>
  );
}
