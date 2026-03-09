import type { TikiBar } from "@/lib/data-schema";

export type TikiFilters = {
  search: string;
  minimumRating: number;
  startLocal?: string;
  endLocal?: string;
};

function hhmmToMinutes(value: string) {
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2));
  return hours * 60 + minutes;
}

function weekdayFromDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function parseLocalDateTime(value?: string) {
  if (!value) {
    return null;
  }

  const [date, time] = value.split("T");
  if (!date || !time) {
    return null;
  }

  const day = weekdayFromDate(date);
  if (day === null) {
    return null;
  }

  const [hours, minutes] = time.split(":");
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  if (Number.isNaN(totalMinutes)) {
    return null;
  }

  return { day, totalMinutes };
}

function minutesSinceWeekStart(day: number, minutes: number) {
  return day * 1440 + minutes;
}

function normalizeCloseDay(openDay: number, closeDay: number, openMinutes: number, closeMinutes: number) {
  if (closeDay > openDay) {
    return closeDay;
  }

  if (closeDay === openDay && closeMinutes >= openMinutes) {
    return closeDay;
  }

  return closeDay + 7;
}

function isOpenForRange(bar: TikiBar, startLocal?: string, endLocal?: string) {
  if (!startLocal || !endLocal) {
    return true;
  }

  const start = parseLocalDateTime(startLocal);
  const end = parseLocalDateTime(endLocal);

  if (!start || !end) {
    return true;
  }

  let startValue = minutesSinceWeekStart(start.day, start.totalMinutes);
  let endValue = minutesSinceWeekStart(end.day, end.totalMinutes);

  if (endValue <= startValue) {
    endValue += 7 * 1440;
  }

  return bar.openingPeriods.some((period) => {
    const openMinutes = hhmmToMinutes(period.open.time);
    const closeMinutes = hhmmToMinutes(period.close.time);
    const normalizedCloseDay = normalizeCloseDay(
      period.open.day,
      period.close.day,
      openMinutes,
      closeMinutes,
    );

    const openValue = minutesSinceWeekStart(period.open.day, openMinutes);
    const closeValue = minutesSinceWeekStart(normalizedCloseDay, closeMinutes);

    const candidates = [
      { openValue, closeValue },
      { openValue: openValue + 7 * 1440, closeValue: closeValue + 7 * 1440 },
      { openValue: openValue - 7 * 1440, closeValue: closeValue - 7 * 1440 },
    ];

    return candidates.some(
      (candidate) => startValue >= candidate.openValue && endValue <= candidate.closeValue,
    );
  });
}

export function filterBars(bars: TikiBar[], filters: TikiFilters) {
  const query = filters.search.trim().toLowerCase();

  return bars.filter((bar) => {
    const matchesSearch = !query || bar.name.toLowerCase().includes(query);
    const matchesRating = bar.rating >= filters.minimumRating;
    const matchesHours = isOpenForRange(bar, filters.startLocal, filters.endLocal);

    return matchesSearch && matchesRating && matchesHours;
  });
}
