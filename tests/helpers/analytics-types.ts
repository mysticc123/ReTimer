/**
 * Type definitions for analytics tests.
 * Mirrors the types from src/types.ts and src/utils/analytics.ts
 */

export interface FocusSession {
  id: string;
  mode: 'pomodoro' | 'countdown' | 'interval';
  phase: 'focus' | 'work' | 'single';
  round?: number;
  totalRounds?: number;
  plannedDurationMs: number;
  actualDurationMs: number;
  startedAtMs: number;
  completedAtMs: number;
}

export interface DailySummary {
  dayStart: number;
  focusedMs: number;
  sessionCount: number;
  sessions: FocusSession[];
}

export interface PeriodSummary {
  periodStart: number;
  periodEnd: number;
  focusedMs: number;
  sessionCount: number;
  dailySummaries: DailySummary[];
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastProductiveDay: number | null;
}

export interface AnalyticsModule {
  startOfDay(timestamp: number): number;
  startOfWeek(timestamp: number): number;
  startOfMonth(timestamp: number): number;
  startOfNextMonth(timestamp: number): number;
  isValidSession(session: FocusSession): boolean;
  filterValidSessions(sessions: FocusSession[]): FocusSession[];
  groupByDay(sessions: FocusSession[]): Map<number, FocusSession[]>;
  calculateFocusedTime(sessions: FocusSession[]): number;
  calculateSessionCount(sessions: FocusSession[]): number;
  buildDailySummary(sessions: FocusSession[], dayStart: number): DailySummary | null;
  buildDailySummaries(sessions: FocusSession[]): DailySummary[];
  buildWeeklySummary(sessions: FocusSession[], referenceTimestamp: number): PeriodSummary;
  buildMonthlySummary(sessions: FocusSession[], referenceTimestamp: number): PeriodSummary;
  computeStreakInfo(sessions: FocusSession[], now?: number): StreakInfo;
  groupSessionsByDay(sessions: FocusSession[]): Map<number, FocusSession[]>;
  setNowFn(fn?: () => number): void;
}