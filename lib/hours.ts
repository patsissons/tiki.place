import type { Hours, HoursPeriod } from "./schema/common";

const WEEK_MIN = 7 * 1440;

export type LocalMoment = { day: number; minutes: number }; // day 0 = Sunday

/** The venue-local weekday and minutes-since-midnight for an instant. */
export function localMoment(date: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { day: day < 0 ? 0 : day, minutes };
}

const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2));

/** [start, end) in minutes since week start, end may exceed a week for overnight wrap. */
export function periodRange(p: HoursPeriod): { start: number; end: number } {
  const start = p.open.day * 1440 + hhmm(p.open.time);
  if (!p.close) return { start, end: start + WEEK_MIN }; // open 24h / continuous
  let end = p.close.day * 1440 + hhmm(p.close.time);
  if (end <= start) end += WEEK_MIN;
  return { start, end };
}

export type OpenState =
  | { open: true; closesAt: LocalMoment | null }
  | { open: false; opensAt: LocalMoment | null };

export function openStateAt(hours: Hours, moment: LocalMoment): OpenState {
  const now = moment.day * 1440 + moment.minutes;
  let nextOpen = Infinity;
  for (const p of hours.periods) {
    const { start, end } = periodRange(p);
    for (const shift of [-WEEK_MIN, 0, WEEK_MIN]) {
      const s = start + shift;
      const e = end + shift;
      if (now >= s && now < e) {
        if (!p.close) return { open: true, closesAt: null };
        return { open: true, closesAt: { day: p.close.day, minutes: hhmm(p.close.time) } };
      }
      if (s > now && s < nextOpen) nextOpen = s;
    }
  }
  if (nextOpen === Infinity) return { open: false, opensAt: null };
  const n = ((nextOpen % WEEK_MIN) + WEEK_MIN) % WEEK_MIN;
  return { open: false, opensAt: { day: Math.floor(n / 1440), minutes: n % 1440 } };
}

export function isOpenNow(hours: Hours | undefined, timeZone: string | undefined, now = new Date()): boolean | null {
  if (!hours || !timeZone || hours.periods.length === 0) return null;
  return openStateAt(hours, localMoment(now, timeZone)).open;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}
