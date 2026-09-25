import type { FocusSession } from '../types';
import { startOfDay } from './analytics';

/**
 * One rendered History date bucket.
 */
export interface HistorySection {
  title: string;
  data: FocusSession[];
}

/**
 * Build the three fixed date buckets (newest-first within each),
 * grouping by completion day so midnight crossovers count on the
 * day the session finished.
 *
 * `now` anchors the Today/Yesterday boundaries (defaults to the current
 * wall-clock time). Screens pass a day-keyed refresh token through their
 * memo dependencies so a mounted screen recomputes when the local calendar
 * day changes; tests pass explicit reference times for deterministic
 * date-boundary coverage.
 */
export function buildSections(
  sessions: FocusSession[],
  now: number = Date.now()
): HistorySection[] {
  const sorted = [...sessions].sort((a, b) => b.completedAtMs - a.completedAtMs);
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const today: FocusSession[] = [];
  const yesterday: FocusSession[] = [];
  const earlier: FocusSession[] = [];

  for (const session of sorted) {
    if (session.completedAtMs >= todayStart) {
      today.push(session);
    } else if (session.completedAtMs >= yesterdayStart) {
      yesterday.push(session);
    } else {
      earlier.push(session);
    }
  }

  const sections: HistorySection[] = [];
  if (today.length > 0) sections.push({ title: 'Today', data: today });
  if (yesterday.length > 0) sections.push({ title: 'Yesterday', data: yesterday });
  if (earlier.length > 0) sections.push({ title: 'Earlier', data: earlier });
  return sections;
}
