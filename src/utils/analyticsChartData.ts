/**
 * Analytics chart data utilities — pure deterministic transformations from
 * existing `dailySummaries` to visualization-ready shapes.
 * No calculations are duplicated from analytics.ts; only data shaping.
 */

import type { DailySummary, PeriodSummary } from './analytics';

/** Number of discrete intensity levels for visualization. */
const INTENSITY_LEVELS = 4;

/**
 * Normalizes a daily focusedMs value to an intensity level 0..INTENSITY_LEVELS.
 * 0 = zero focus; 1..INTENSITY_LEVELS = proportional to maxFocusedMs.
 * Division-by-zero safe: if maxFocusedMs === 0, all non-zero values get level 1.
 */
export function getIntensityLevel(
  focusedMs: number,
  maxFocusedMs: number
): number {
  if (focusedMs <= 0) return 0;
  if (maxFocusedMs <= 0) return 1;

  const ratio = Math.min(1, focusedMs / maxFocusedMs);
  const level = Math.ceil(ratio * INTENSITY_LEVELS);
  return Math.min(INTENSITY_LEVELS, Math.max(1, level));
}

/**
 * Weekly chart data point for one day.
 */
export interface WeeklyChartDay {
  /** Day index 0=Monday ... 6=Sunday */
  index: number;
  /** Short label: "Mon", "Tue", ... */
  label: string;
  /** Focused milliseconds for this day */
  focusedMs: number;
  /** Number of sessions */
  sessionCount: number;
  /** Intensity level 0..INTENSITY_LEVELS */
  intensity: number;
  /** Whether this day is today (local calendar day) */
  isToday: boolean;
}

/**
 * Builds 7-day weekly chart data (Mon→Sun) from a PeriodSummary.
 * Missing days are included with focusedMs=0, sessionCount=0.
 * Intensity is normalized against the week's maximum daily focus.
 */
export function buildWeeklyChartData(
  weeklySummary: PeriodSummary,
  now: number = Date.now()
): WeeklyChartDay[] {
  const { periodStart, dailySummaries } = weeklySummary;

  // Find max focus in this week for normalization
  let maxFocusedMs = 0;
  for (const day of dailySummaries) {
    if (day.focusedMs > maxFocusedMs) maxFocusedMs = day.focusedMs;
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const chartDays: WeeklyChartDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dayStart = periodStart + i * 24 * 60 * 60 * 1000;
    const match = dailySummaries.find((d) => d.dayStart === dayStart);
    const focusedMs = match?.focusedMs ?? 0;
    const sessionCount = match?.sessionCount ?? 0;

    chartDays.push({
      index: i,
      label: dayLabels[i],
      focusedMs,
      sessionCount,
      intensity: getIntensityLevel(focusedMs, maxFocusedMs),
      isToday: dayStart === todayMs,
    });
  }

  return chartDays;
}

/**
 * Monthly chart data point for one day.
 */
export interface MonthlyChartDay {
  /** Date object for this day (local calendar date) */
  date: Date;
  /** Day of month (1-31) */
  day: number;
  /** Focused milliseconds for this day */
  focusedMs: number;
  /** Number of sessions */
  sessionCount: number;
  /** Intensity level 0..INTENSITY_LEVELS */
  intensity: number;
  /** Whether this day is today (local calendar day) */
  isToday: boolean;
  /** Whether this day belongs to the current month (true) or is a leading/trailing filler (false) */
  inCurrentMonth: boolean;
}

/**
 * Builds monthly calendar grid data from a PeriodSummary.
 * Returns a flat array of days for the calendar grid (including leading/trailing days
 * to fill complete weeks). The grid always starts on Monday.
 * - `inCurrentMonth` distinguishes actual month days from padding.
 * - Intensity is normalized against the month's maximum daily focus.
 */
export function buildMonthlyChartData(
  monthlySummary: PeriodSummary,
  now: number = Date.now()
): MonthlyChartDay[] {
  const { periodStart, periodEnd, dailySummaries } = monthlySummary;

  // Find max focus in this month for normalization
  let maxFocusedMs = 0;
  for (const day of dailySummaries) {
    if (day.focusedMs > maxFocusedMs) maxFocusedMs = day.focusedMs;
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // Create a map for quick lookup
  const dayMap = new Map<number, DailySummary>();
  for (const d of dailySummaries) {
    dayMap.set(d.dayStart, d);
  }

  // Determine the Monday of the week containing periodStart
  const firstDay = new Date(periodStart);
  const firstDayOfWeek = firstDay.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() + mondayOffset);
  gridStart.setHours(0, 0, 0, 0);

  // Determine the Sunday of the week containing periodEnd - 1ms
  const lastDay = new Date(periodEnd - 1);
  const lastDayOfWeek = lastDay.getDay();
  const sundayOffset = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(gridEnd.getDate() + sundayOffset);
  gridEnd.setHours(23, 59, 59, 999);

  const chartDays: MonthlyChartDay[] = [];
  const current = new Date(gridStart);

  while (current <= gridEnd) {
    const dayStart = current.getTime();
    const match = dayMap.get(dayStart);
    const focusedMs = match?.focusedMs ?? 0;
    const sessionCount = match?.sessionCount ?? 0;
    const inCurrentMonth = dayStart >= periodStart && dayStart < periodEnd;

    chartDays.push({
      date: new Date(current),
      day: current.getDate(),
      focusedMs,
      sessionCount,
      intensity: getIntensityLevel(focusedMs, maxFocusedMs),
      isToday: dayStart === todayMs,
      inCurrentMonth,
    });

    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return chartDays;
}

/**
 * Formats focusedMs as a short human-readable string for tooltips/labels.
 * Re-uses the existing formatDurationShort logic pattern.
 */
export function formatFocusedShort(ms: number): string {
  if (ms <= 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours}h`;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}