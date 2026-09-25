/**
 * Analytics view model: composes the existing analytics engine into the
 * single data shape the Analytics screen renders. Pure wiring only — every
 * number comes from src/utils/analytics.ts; no calculations are duplicated.
 */

import type { FocusSession } from '../types';
import {
  buildDailySummary,
  buildMonthlySummary,
  buildWeeklySummary,
  computeStreakInfo,
  filterValidSessions,
  startOfDay,
} from './analytics';

/** Focused time + completed-session count for one period. */
export interface AnalyticsPeriodView {
  focusedMs: number;
  sessionCount: number;
}

/**
 * Daily goal progress view.
 */
export interface DailyGoalProgress {
  /** Configured daily goal in milliseconds. */
  goalMs: number;
  /** Today's focused time in milliseconds. */
  focusedMs: number;
  /** Progress ratio (0..1+, uncapped). */
  progress: number;
  /** Progress capped at 1 for visual progress bars. */
  progressCapped: number;
  /** Remaining milliseconds to reach goal (0 if at or above goal). */
  remainingMs: number;
  /** Whether the goal has been met or exceeded. */
  isCompleted: boolean;
}

/**
 * Everything the Analytics screen displays. `today` doubles as the
 * overview's Today row; streaks come straight from computeStreakInfo.
 * `hasData` is false when history holds no valid (non-future) session,
 * which drives the screen's empty state.
 */
export interface AnalyticsViewModel {
  hasData: boolean;
  today: AnalyticsPeriodView;
  week: AnalyticsPeriodView;
  month: AnalyticsPeriodView;
  currentStreak: number;
  longestStreak: number;
  dailyGoal: DailyGoalProgress;
}

/**
 * Build the Analytics screen view model from persisted history.
 * `now` anchors every period boundary and the strict future-timestamp
 * validation inside the analytics engine (completedAtMs <= now).
 */
export function buildAnalyticsViewModel(
  sessions: FocusSession[],
  now: number = Date.now(),
  dailyFocusGoalMs: number = 2 * 60 * 60 * 1000
): AnalyticsViewModel {
  const valid = filterValidSessions(sessions);
  const today = buildDailySummary(sessions, startOfDay(now));
  const week = buildWeeklySummary(sessions, now);
  const month = buildMonthlySummary(sessions, now);
  const streaks = computeStreakInfo(sessions, now);

  const todayFocusedMs = today?.focusedMs ?? 0;
  const goalMs = dailyFocusGoalMs > 0 ? dailyFocusGoalMs : 2 * 60 * 60 * 1000;
  const progress = goalMs > 0 ? todayFocusedMs / goalMs : 0;
  const progressCapped = Math.min(1, progress);
  const remainingMs = goalMs > todayFocusedMs ? goalMs - todayFocusedMs : 0;
  const isCompleted = todayFocusedMs >= goalMs;

  return {
    hasData: valid.length > 0,
    today: {
      focusedMs: todayFocusedMs,
      sessionCount: today?.sessionCount ?? 0,
    },
    week: {
      focusedMs: week.focusedMs,
      sessionCount: week.sessionCount,
    },
    month: {
      focusedMs: month.focusedMs,
      sessionCount: month.sessionCount,
    },
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    dailyGoal: {
      goalMs,
      focusedMs: todayFocusedMs,
      progress,
      progressCapped,
      remainingMs,
      isCompleted,
    },
  };
}
