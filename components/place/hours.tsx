"use client";

import { useClock } from "@/lib/client/use-clock";
import { formatMinutes, localMoment, openStateAt } from "@/lib/hours";
import type { Hours } from "@/lib/schema/common";
import { cn } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function useOpenState(hours: Hours | undefined, timezone: string | undefined) {
  const now = useClock();
  if (!now || !hours || !timezone || hours.periods.length === 0) return null;
  const moment = localMoment(now, timezone);
  return { moment, state: openStateAt(hours, moment) };
}

export function OpenNow({ hours, timezone, className }: { hours?: Hours; timezone?: string; className?: string }) {
  const s = useOpenState(hours, timezone);
  if (!s) return null;
  if (s.state.open) {
    const closes = s.state.closesAt;
    return (
      <span className={cn("text-amber", className)}>
        Open now{closes ? ` · closes ${formatMinutes(closes.minutes)}` : " · 24 hours"}
      </span>
    );
  }
  const opens = s.state.opensAt;
  const sameDay = opens && opens.day === s.moment.day;
  return (
    <span className={cn("text-fg-muted", className)}>
      Closed{opens ? ` · opens ${sameDay ? "" : `${DAYS[opens.day]?.slice(0, 3)} `}${formatMinutes(opens.minutes)}` : ""}
    </span>
  );
}

export function HoursTable({ hours, timezone }: { hours: Hours; timezone?: string }) {
  const s = useOpenState(hours, timezone);
  const today = s?.moment.day;
  const rows = hours.weekdayText.length === 7 ? hours.weekdayText.map((t, i) => ({ day: DAYS[(i + 1) % 7]!, text: t.replace(/^[A-Za-z]+:\s*/, ""), index: (i + 1) % 7 })) : [];
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      {rows.map((r) => (
        <div key={r.day} className={cn("contents", r.index === today && "font-medium text-fg")}>
          <dt className={cn("text-fg-muted", r.index === today && "text-amber")}>{r.day}</dt>
          <dd className="font-mono text-[13px]">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}
