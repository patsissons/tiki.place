import type { StatusValue } from "../schema/common";

export const STATUS_LABEL: Record<StatusValue, string> = {
  open: "Open",
  temporarily_closed: "Temporarily closed",
  closed: "Closed",
  coming_soon: "Coming soon",
  unverified: "Unverified",
};

/** Tailwind classes per status for chips and markers. */
export const STATUS_CLASS: Record<StatusValue, string> = {
  open: "bg-amber/15 text-amber border-amber/40",
  temporarily_closed: "bg-amber/5 text-amber/80 border-amber/30 border-dashed",
  closed: "bg-coral/10 text-coral border-coral/40",
  coming_soon: "bg-seaglass/10 text-seaglass border-seaglass/40 border-dashed",
  unverified: "bg-fg/5 text-fg-muted border-line",
};

export const STATUS_COLOR: Record<StatusValue, string> = {
  open: "#f2a93b",
  temporarily_closed: "#b07a2a",
  closed: "#e0633d",
  coming_soon: "#5fc2b4",
  unverified: "#8b9792",
};
