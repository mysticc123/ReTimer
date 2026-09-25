import type { FocusSession } from '../types';

/**
 * Analytics types and pure functions for ReTimer productivity analytics.
 * All functions are pure, deterministic, and have no external dependencies.
 */

/**
 * Calendar day boundaries using local device time.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/**
 * Returns the local midnight (00:00:00.000) timestamp for the given timestamp.
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Returns the local midnight timestamp for the Monday of the week containing the given timestamp.
 * Week starts on Monday (0 = Monday, ..., 6 = Sunday).
 */
export function startOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day; // Monday = 1
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Returns the local midnight timestamp for the first day of the month containing the given timestamp.
 */
export function startOfMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Returns the local midnight timestamp for the first day of the next month.
 */
export function startOfNextMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Returns true if the timestamp is a valid finite positive number that is not in the future.
 * A timestamp exactly equal to the reference time is valid.
 * Any timestamp in the future (even 1ms) is invalid.
 * In production, this prevents future timestamps from being treated as completed sessions.
 * In tests, the clock is controlled via setNowFn.
 */
let nowFn: () => number = () => Date.now();

/**
 * Set a custom clock function for testing. Call with no arguments to reset to real Date.now().
 */
export function setNowFn(fn?: () => number): void {
  nowFn = fn ?? (() => Date.now());
}

function isValidTimestamp(ts: number): boolean {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
    return false;
  }
  // Reject timestamps that are in the future (even 1ms).
  // nowFn() is the current wall-clock time; anything beyond now is invalid.
  const now = nowFn();
  if (ts > now) {
    return false;
  }
  return true;
}

/**
 * Returns true if the duration is a valid finite non-negative number.
 */
function isValidDuration(d: number): boolean {
  return typeof d === 'number' && Number.isFinite(d) && d >= 0;
}

/**
 * Validates a FocusSession record. Returns true if the record has valid timestamps and duration.
 * Only completedAtMs and actualDurationMs are required for analytics validity.
 * startedAtMs and plannedDurationMs are optional metadata.
 */
export function isValidSession(session: FocusSession): boolean {
  return (
    isValidTimestamp(session.completedAtMs) &&
    isValidDuration(session.actualDurationMs)
  );
}

/**
 * Filters out invalid sessions from an array.
 * Invalid sessions are silently excluded from analytics.
 */
export function filterValidSessions(sessions: FocusSession[]): FocusSession[] {
  return sessions.filter(isValidSession);
}

/**
 * Represents a single calendar day's analytics summary.
 */
export interface DailySummary {
  /** Start of the day (local midnight) in milliseconds. */
  dayStart: number;
  /** Total focused time in milliseconds for this day. */
  focusedMs: number;
  /** Number of completed focus sessions on this day. */
  sessionCount: number;
  /** The sessions belonging to this day (valid sessions only). */
  sessions: FocusSession[];
}

/**
 * Represents a period summary (week or month) with daily breakdown.
 */
export interface PeriodSummary {
  /** Start of the period (inclusive) in milliseconds. */
  periodStart: number;
  /** End of the period (exclusive) in milliseconds. */
  periodEnd: number;
  /** Total focused time in milliseconds for the period. */
  focusedMs: number;
  /** Total session count for the period. */
  sessionCount: number;
  /** Daily breakdown for the period. */
  dailySummaries: DailySummary[];
}

/**
 * Streak information.
 */
export interface StreakInfo {
  /** Current streak: consecutive productive days ending TODAY. */
  currentStreak: number;
  /** Longest streak found in available history. */
  longestStreak: number;
  /** Local midnight timestamp of the most recent productive day, or null if none. */
  lastProductiveDay: number | null;
}

/**
 * Groups valid sessions by their completion day (local calendar day).
 * Returns a Map keyed by dayStart (local midnight timestamp).
 */
export function groupByDay(sessions: FocusSession[]): Map<number, FocusSession[]> {
  const valid = filterValidSessions(sessions);
  const map = new Map<number, FocusSession[]>();

  for (const session of valid) {
    const dayStart = startOfDay(session.completedAtMs);
    const existing = map.get(dayStart);
    if (existing) {
      existing.push(session);
    } else {
      map.set(dayStart, [session]);
    }
  }

  return map;
}

/**
 * Calculates total focused time in milliseconds from a session array.
 * Invalid sessions are excluded.
 */
export function calculateFocusedTime(sessions: FocusSession[]): number {
  let total = 0;
  for (const session of sessions) {
    if (isValidSession(session)) {
      total += session.actualDurationMs;
    }
  }
  return total;
}

/**
 * Calculates session count from a session array.
 * Invalid sessions are excluded.
 */
export function calculateSessionCount(sessions: FocusSession[]): number {
  let count = 0;
  for (const session of sessions) {
    if (isValidSession(session)) {
      count++;
    }
  }
  return count;
}

/**
 * Builds a DailySummary for a specific local calendar day.
 * Returns null if no valid sessions exist for that day.
 */
export function buildDailySummary(
  sessions: FocusSession[],
  dayStart: number
): DailySummary | null {
  const dayEnd = dayStart + MS_PER_DAY;
  const daySessions: FocusSession[] = [];

  for (const session of sessions) {
    if (!isValidSession(session)) continue;
    if (session.completedAtMs >= dayStart && session.completedAtMs < dayEnd) {
      daySessions.push(session);
    }
  }

  if (daySessions.length === 0) {
    return null;
  }

  return {
    dayStart,
    focusedMs: calculateFocusedTime(daySessions),
    sessionCount: daySessions.length,
    sessions: daySessions,
  };
}

/**
 * Builds all DailySummary objects from a session collection.
 * Returns summaries sorted by dayStart ascending (oldest first).
 */
export function buildDailySummaries(sessions: FocusSession[]): DailySummary[] {
  const byDay = groupByDay(sessions);
  const summaries: DailySummary[] = [];

  for (const [dayStart, daySessions] of byDay) {
    summaries.push({
      dayStart,
      focusedMs: calculateFocusedTime(daySessions),
      sessionCount: daySessions.length,
      sessions: daySessions,
    });
  }

  // Sort by dayStart ascending
  summaries.sort((a, b) => a.dayStart - b.dayStart);
  return summaries;
}

/**
 * Builds a weekly summary (Monday-Sunday) for the week containing the given timestamp.
 * Week starts on Monday 00:00 local time.
 */
export function buildWeeklySummary(
  sessions: FocusSession[],
  referenceTimestamp: number
): PeriodSummary {
  const weekStart = startOfWeek(referenceTimestamp);
  const weekEnd = weekStart + 7 * MS_PER_DAY;

  const dailySummaries: DailySummary[] = [];

  for (let i = 0; i < 7; i++) {
    const dayStart = weekStart + i * MS_PER_DAY;
    const summary = buildDailySummary(sessions, dayStart);
    if (summary) {
      dailySummaries.push(summary);
    }
  }

  let focusedMs = 0;
  let sessionCount = 0;

  for (const day of dailySummaries) {
    focusedMs += day.focusedMs;
    sessionCount += day.sessionCount;
  }

  return {
    periodStart: weekStart,
    periodEnd: weekEnd,
    focusedMs,
    sessionCount,
    dailySummaries,
  };
}

/**
 * Builds a monthly summary for the month containing the given timestamp.
 * Month boundaries are local calendar month (1st to last day).
 */
export function buildMonthlySummary(
  sessions: FocusSession[],
  referenceTimestamp: number
): PeriodSummary {
  const monthStart = startOfMonth(referenceTimestamp);
  const monthEnd = startOfNextMonth(referenceTimestamp);

  const dailySummaries: DailySummary[] = [];

  let current = monthStart;
  while (current < monthEnd) {
    const summary = buildDailySummary(sessions, current);
    if (summary) {
      dailySummaries.push(summary);
    }
    current += MS_PER_DAY;
  }

  let focusedMs = 0;
  let sessionCount = 0;

  for (const day of dailySummaries) {
    focusedMs += day.focusedMs;
    sessionCount += day.sessionCount;
  }

  return {
    periodStart: monthStart,
    periodEnd: monthEnd,
    focusedMs,
    sessionCount,
    dailySummaries,
  };
}

/**
 * Computes streak information from session history.
 * Current streak MUST end TODAY (i.e., today must be productive for streak > 0).
 */
export function computeStreakInfo(sessions: FocusSession[], now: number = Date.now()): StreakInfo {
  const valid = filterValidSessions(sessions);

  if (valid.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastProductiveDay: null,
    };
  }

  // Get all unique productive days from history
  const productiveDays = new Set<number>();
  for (const session of valid) {
    productiveDays.add(startOfDay(session.completedAtMs));
  }

  const todayStart = startOfDay(now);
  const sortedDays = Array.from(productiveDays).sort((a, b) => a - b);

  // Compute current streak (must end today)
  let currentStreak = 0;
  if (productiveDays.has(todayStart)) {
    currentStreak = 1;
    let checkDay = todayStart - MS_PER_DAY;
    while (productiveDays.has(checkDay)) {
      currentStreak++;
      checkDay -= MS_PER_DAY;
    }
  }

  // Compute longest streak
  let longestStreak = 0;
  let current = 0;
  let prevDay: number | null = null;

  for (const day of sortedDays) {
    if (prevDay === null || day - prevDay === MS_PER_DAY) {
      current++;
    } else {
      current = 1;
    }
    if (current > longestStreak) {
      longestStreak = current;
    }
    prevDay = day;
  }

  // Last productive day
  const lastProductiveDay = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null;

  return {
    currentStreak,
    longestStreak,
    lastProductiveDay,
  };
}

/**
 * Group sessions by day (exported for testing).
 */
export function groupSessionsByDay(sessions: FocusSession[]): Map<number, FocusSession[]> {
  return groupByDay(sessions);
}