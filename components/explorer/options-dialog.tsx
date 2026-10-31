"use client";

import { Settings2, X } from "lucide-react";
import { Dialog, RadioGroup } from "radix-ui";
import { setSkyMode, useSkyMode, type SkyMode } from "@/lib/client/sky-mode";
import { cn } from "@/lib/utils";

const SKY_OPTIONS: { value: SkyMode; label: string; hint: string }[] = [
  { value: "accelerated", label: "Accelerated", hint: "Stars stay true to the clock; the Sun, Moon and planets run a day every 20 seconds." },
  { value: "real", label: "Real time", hint: "Everything sits where it is right now, as a planetarium would show it." },
  { value: "none", label: "None", hint: "No sky behind the globe. Lightest on the battery." },
];

/** Gear button in the explorer header that opens the site options: for now, how the sky runs. */
export function OptionsDialog({ className }: { className?: string }) {
  const sky = useSkyMode();
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn("pointer-events-auto flex size-10 items-center justify-center rounded-full bg-bg/70 text-fg-muted backdrop-blur transition-colors hover:text-fg", className)}
          aria-label="Options"
        >
          <Settings2 className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-line bg-bg-elevated p-4 shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold">Options</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="rounded-full p-2 text-fg-muted hover:text-fg" aria-label="Close options">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wider text-fg-muted">Sky behind the globe</legend>
            <RadioGroup.Root value={sky} onValueChange={(v) => setSkyMode(v as SkyMode)} aria-label="Sky mode" className="mt-2 flex flex-col gap-1.5">
              {SKY_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    sky === o.value ? "border-amber/60 bg-amber/10" : "border-line hover:bg-fg/5",
                  )}
                >
                  <RadioGroup.Item
                    value={o.value}
                    className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-fg-muted data-[state=checked]:border-amber"
                  >
                    <RadioGroup.Indicator className="size-2 rounded-full bg-amber" />
                  </RadioGroup.Item>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{o.label}</span>
                    <span className="text-xs leading-snug text-fg-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup.Root>
          </fieldset>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
