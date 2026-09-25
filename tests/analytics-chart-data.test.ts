/**
 * P5 Weekly/Monthly Chart Data — deterministic tests.
 *
 * Covers the analyticsChartData utilities that transform existing
 * dailySummaries/PeriodSummary into visualization-ready shapes.
 * Tests the exact data shapes consumed by the Analytics screen visualizations.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getIntensityLevel,
  buildWeeklyChartData,
  buildMonthlyChartData,
  formatFocusedShort,
} from '../src/utils/analyticsChartData';
import {
  buildWeeklySummary,
  buildMonthlySummary,
  filterValidSessions,
} from '../src/utils/analytics';
import type { DailySummary, PeriodSummary } from '../src/utils/analytics';
import type { FocusSession } from '../src/types';

// Helper to create a valid session
function createSession(overrides: Partial<FocusSession> = {}): FocusSession {
  const now = Date.now();
  return {
    id: `${now}-${Math.random()}`,
    mode: 'pomodoro',
    phase: 'focus',
    plannedDurationMs: 25 * 60 * 1000,
    actualDurationMs: 25 * 60 * 1000,
    startedAtMs: now - 25 * 60 * 1000,
    completedAtMs: now,
    ...overrides,
  };
}

describe('P5 Analytics Chart Data', () => {
  describe('getIntensityLevel', () => {
    it('returns 0 for zero or negative focus', () => {
      assert.equal(getIntensityLevel(0, 1000), 0);
      assert.equal(getIntensityLevel(-100, 1000), 0);
    });

    it('returns 1 when maxFocusedMs is zero but value is positive', () => {
      assert.equal(getIntensityLevel(1000, 0), 1);
      assert.equal(getIntensityLevel(5000, 0), 1);
    });

    it('scales proportionally to maxFocusedMs', () => {
      // max = 10000, INTENSITY_LEVELS = 4
      // 2500 -> 0.25 -> ceil(1) = 1
      assert.equal(getIntensityLevel(2500, 10000), 1);
      // 5000 -> 0.5 -> ceil(2) = 2
      assert.equal(getIntensityLevel(5000, 10000), 2);
      // 7500 -> 0.75 -> ceil(3) = 3
      assert.equal(getIntensityLevel(7500, 10000), 3);
      // 10000 -> 1.0 -> ceil(4) = 4
      assert.equal(getIntensityLevel(10000, 10000), 4);
      // 15000 (capped at max) -> 1.0 -> 4
      assert.equal(getIntensityLevel(15000, 10000), 4);
    });

    it('never exceeds INTENSITY_LEVELS', () => {
      assert.equal(getIntensityLevel(999999, 1000), 4);
    });

    it('never returns negative', () => {
      assert.equal(getIntensityLevel(100, 1000), 1);
    });
  });

  describe('formatFocusedShort', () => {
    it('returns 0m for zero', () => {
      assert.equal(formatFocusedShort(0), '0m');
    });

    it('formats minutes correctly', () => {
      assert.equal(formatFocusedShort(5 * 60 * 1000), '5m');
      assert.equal(formatFocusedShort(25 * 60 * 1000), '25m');
      assert.equal(formatFocusedShort(59 * 60 * 1000), '59m');
    });

    it('formats hours correctly', () => {
      assert.equal(formatFocusedShort(60 * 60 * 1000), '1h');
      assert.equal(formatFocusedShort(90 * 60 * 1000), '1h 30m');
      assert.equal(formatFocusedShort(2 * 60 * 60 * 1000), '2h');
      assert.equal(formatFocusedShort(3 * 60 * 60 * 1000 + 15 * 60 * 1000), '3h 15m');
    });

    it('handles exact hour boundaries', () => {
      assert.equal(formatFocusedShort(2 * 60 * 60 * 1000), '2h');
      assert.equal(formatFocusedShort(3 * 60 * 60 * 1000), '3h');
    });
  });

  describe('buildWeeklyChartData', () => {
    let weeklySummary: PeriodSummary;
    const referenceMs = new Date('2026-01-14T12:00:00').getTime(); // Wednesday Jan 14, 2026

    beforeEach(() => {
      // Build a week with varied data
      const sessions: FocusSession[] = [
        // Monday (Jan 12): 30min
        createSession({
          completedAtMs: new Date('2026-01-12T10:00:00').getTime(),
          actualDurationMs: 30 * 60 * 1000,
        }),
        // Tuesday (Jan 13): 2h
        createSession({
          completedAtMs: new Date('2026-01-13T10:00:00').getTime(),
          actualDurationMs: 2 * 60 * 60 * 1000,
        }),
        // Wednesday (Jan 14, today): 1h
        createSession({
          completedAtMs: new Date('2026-01-14T10:00:00').getTime(),
          actualDurationMs: 1 * 60 * 60 * 1000,
        }),
        // Thursday (Jan 15): 3h
        createSession({
          completedAtMs: new Date('2026-01-15T10:00:00').getTime(),
          actualDurationMs: 3 * 60 * 60 * 1000,
        }),
        // Friday (Jan 16): 0
        // Saturday (Jan 17): 2h
        createSession({
          completedAtMs: new Date('2026-01-17T10:00:00').getTime(),
          actualDurationMs: 2 * 60 * 60 * 1000,
        }),
        // Sunday (Jan 18): 0
      ];

      // Build the weekly summary directly from analytics
      weeklySummary = buildWeeklySummary(filterValidSessions(sessions), referenceMs);
    });

    it('returns exactly 7 days', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      assert.equal(data.length, 7);
    });

    it('Monday is first (index 0)', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      assert.equal(data[0].label, 'Mon');
      assert.equal(data[0].index, 0);
    });

    it('Sunday is last (index 6)', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      assert.equal(data[6].label, 'Sun');
      assert.equal(data[6].index, 6);
    });

    it('missing days have focusedMs=0 and sessionCount=0', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      // Friday is index 4, should be 0
      assert.equal(data[4].focusedMs, 0);
      assert.equal(data[4].sessionCount, 0);
      // Sunday is index 6, should be 0
      assert.equal(data[6].focusedMs, 0);
      assert.equal(data[6].sessionCount, 0);
    });

    it('daily durations map correctly from dailySummaries', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      // Monday: 30min
      assert.equal(data[0].focusedMs, 30 * 60 * 1000);
      assert.equal(data[0].sessionCount, 1);
      // Tuesday: 2h
      assert.equal(data[1].focusedMs, 2 * 60 * 60 * 1000);
      assert.equal(data[1].sessionCount, 1);
      // Wednesday (today): 1h
      assert.equal(data[2].focusedMs, 1 * 60 * 60 * 1000);
      assert.equal(data[2].sessionCount, 1);
      // Thursday: 3h
      assert.equal(data[3].focusedMs, 3 * 60 * 60 * 1000);
      assert.equal(data[3].sessionCount, 1);
      // Saturday: 2h
      assert.equal(data[5].focusedMs, 2 * 60 * 60 * 1000);
      assert.equal(data[5].sessionCount, 1);
    });

    it('max daily value produces max intensity level (4)', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      // Thursday has 3h = max, should be intensity 4
      assert.equal(data[3].intensity, 4);
    });

    it('all-zero week does not produce NaN/infinite', () => {
      // Create summary with no sessions
      const emptySummary: PeriodSummary = {
        periodStart: referenceMs,
        periodEnd: referenceMs + 7 * 24 * 60 * 60 * 1000,
        focusedMs: 0,
        sessionCount: 0,
        dailySummaries: [],
      };
      const data = buildWeeklyChartData(emptySummary, referenceMs);
      for (const day of data) {
        assert.equal(day.intensity, 0);
        assert.equal(day.focusedMs, 0);
        assert.equal(day.sessionCount, 0);
      }
    });

    it('relative scaling is deterministic', () => {
      const data1 = buildWeeklyChartData(weeklySummary, referenceMs);
      const data2 = buildWeeklyChartData(weeklySummary, referenceMs);
      for (let i = 0; i < 7; i++) {
        assert.equal(data1[i].intensity, data2[i].intensity);
        assert.equal(data1[i].focusedMs, data2[i].focusedMs);
      }
    });

    it('isToday flag is set correctly for the reference day', () => {
      const data = buildWeeklyChartData(weeklySummary, referenceMs);
      // Wednesday is index 2, referenceMs is Wednesday
      assert.equal(data[2].isToday, true);
      // Other days should not be today
      for (let i = 0; i < 7; i++) {
        if (i !== 2) assert.equal(data[i].isToday, false);
      }
    });
  });

  describe('buildMonthlyChartData', () => {
    let monthlySummary: PeriodSummary;
    const referenceMs = new Date('2026-01-15T12:00:00').getTime(); // Mid-January 2026

    beforeEach(() => {
      const sessions: FocusSession[] = [
        // Jan 1: 30min
        createSession({
          completedAtMs: new Date('2026-01-01T10:00:00').getTime(),
          actualDurationMs: 30 * 60 * 1000,
        }),
        // Jan 15 (today): 2h
        createSession({
          completedAtMs: new Date('2026-01-15T10:00:00').getTime(),
          actualDurationMs: 2 * 60 * 60 * 1000,
        }),
        // Jan 31: 1h
        createSession({
          completedAtMs: new Date('2026-01-31T10:00:00').getTime(),
          actualDurationMs: 1 * 60 * 60 * 1000,
        }),
      ];

      monthlySummary = buildMonthlySummary(filterValidSessions(sessions), referenceMs);
    });

    it('includes correct number of days for the month grid (complete weeks)', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      // January 2026 has 31 days, starts on Thursday, ends on Saturday
      // Grid should start Monday Dec 29 2025, end Sunday Feb 1 2026 = 35 days (5 weeks)
      assert.equal(data.length, 35);
    });

    it('month/year are correct for inCurrentMonth days', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      const januaryDays = data.filter((d) => d.inCurrentMonth);
      // January 2026 has 31 days
      assert.equal(januaryDays.length, 31);
      for (const day of januaryDays) {
        assert.equal(day.date.getMonth(), 0); // January = 0
        assert.equal(day.date.getFullYear(), 2026);
      }
    });

    it('daily summaries map to correct calendar date', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      const jan1 = data.find((d) => d.inCurrentMonth && d.day === 1);
      assert.ok(jan1);
      assert.equal(jan1!.focusedMs, 30 * 60 * 1000);
      assert.equal(jan1!.sessionCount, 1);

      const jan15 = data.find((d) => d.inCurrentMonth && d.day === 15);
      assert.ok(jan15);
      assert.equal(jan15!.focusedMs, 2 * 60 * 60 * 1000);
      assert.equal(jan15!.sessionCount, 1);

      const jan31 = data.find((d) => d.inCurrentMonth && d.day === 31);
      assert.ok(jan31);
      assert.equal(jan31!.focusedMs, 1 * 60 * 60 * 1000);
      assert.equal(jan31!.sessionCount, 1);
    });

    it('missing days have zero focus', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      const jan2 = data.find((d) => d.inCurrentMonth && d.day === 2);
      assert.ok(jan2);
      assert.equal(jan2!.focusedMs, 0);
      assert.equal(jan2!.sessionCount, 0);
      assert.equal(jan2!.intensity, 0);
    });

    it('month boundaries do not leak adjacent month data into inCurrentMonth', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      // Dec 29, 30, 31 2025 and Feb 1 2026 should be padding (not inCurrentMonth)
      for (const day of data) {
        if (!day.inCurrentMonth) {
          // Verify the date is actually outside Jan 2026 using the day number and month
          assert.ok(
            day.date.getMonth() !== 0 || day.date.getFullYear() !== 2026,
            `Day ${day.date.toISOString()} has inCurrentMonth=false but appears to be in Jan 2026`
          );
        }
      }
      // All Jan 1-31 should be inCurrentMonth
      const janDays = data.filter((d) => d.inCurrentMonth);
      assert.equal(janDays.length, 31);
    });

    it('intensity mapping is deterministic', () => {
      const data1 = buildMonthlyChartData(monthlySummary, referenceMs);
      const data2 = buildMonthlyChartData(monthlySummary, referenceMs);
      for (let i = 0; i < data1.length; i++) {
        assert.equal(data1[i].intensity, data2[i].intensity);
        assert.equal(data1[i].focusedMs, data2[i].focusedMs);
      }
    });

    it('all-zero month behaves correctly', () => {
      const emptySummary: PeriodSummary = {
        periodStart: new Date('2026-01-01').getTime(),
        periodEnd: new Date('2026-02-01').getTime(),
        focusedMs: 0,
        sessionCount: 0,
        dailySummaries: [],
      };
      const data = buildMonthlyChartData(emptySummary, referenceMs);
      for (const day of data) {
        assert.equal(day.intensity, 0);
        assert.equal(day.focusedMs, 0);
        assert.equal(day.sessionCount, 0);
      }
    });

    it('isToday flag is set correctly for the reference day', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      const today = data.find((d) => d.isToday);
      assert.ok(today);
      assert.equal(today!.day, 15);
      assert.equal(today!.inCurrentMonth, true);
      // Only one day should be today
      assert.equal(data.filter((d) => d.isToday).length, 1);
    });

    it('calendar produces complete 7-day weeks (Mon..Sun per row)', () => {
      const data = buildMonthlyChartData(monthlySummary, referenceMs);
      // Every row must be exactly 7 cells so the Sunday column is never dropped.
      assert.equal(data.length % 7, 0);
      // Each 7-cell block must start on Monday and end on Sunday (weekday alignment).
      const weekdayOfIndex = (i: number) => {
        const wd = i % 7;
        return wd === 6 ? 0 : wd + 1; // 0=Sun backend index; Monday is index 0
      };
      for (let i = 0; i < data.length; i++) {
        assert.equal(data[i].date.getDay(), weekdayOfIndex(i));
      }
    });
  });

  describe('Regression: existing Analytics values unchanged', () => {
    it('weekly chart data does not modify original PeriodSummary', () => {
      const sessions: FocusSession[] = [
        createSession({
          completedAtMs: new Date('2026-01-12T10:00:00').getTime(),
          actualDurationMs: 30 * 60 * 1000,
        }),
      ];
      
      const referenceMs = new Date('2026-01-14T12:00:00').getTime();
      const weeklySummary = buildWeeklySummary(filterValidSessions(sessions), referenceMs);
      const originalFocusedMs = weeklySummary.focusedMs;
      const originalSessionCount = weeklySummary.sessionCount;
      const originalDailyLength = weeklySummary.dailySummaries.length;

      buildWeeklyChartData(weeklySummary, referenceMs);

      assert.equal(weeklySummary.focusedMs, originalFocusedMs);
      assert.equal(weeklySummary.sessionCount, originalSessionCount);
      assert.equal(weeklySummary.dailySummaries.length, originalDailyLength);
    });

    it('monthly chart data does not modify original PeriodSummary', () => {
      const sessions: FocusSession[] = [
        createSession({
          completedAtMs: new Date('2026-01-15T10:00:00').getTime(),
          actualDurationMs: 2 * 60 * 60 * 1000,
        }),
      ];
      
      const referenceMs = new Date('2026-01-15T12:00:00').getTime();
      const monthlySummary = buildMonthlySummary(filterValidSessions(sessions), referenceMs);
      const originalFocusedMs = monthlySummary.focusedMs;
      const originalSessionCount = monthlySummary.sessionCount;
      const originalDailyLength = monthlySummary.dailySummaries.length;

      buildMonthlyChartData(monthlySummary, referenceMs);

      assert.equal(monthlySummary.focusedMs, originalFocusedMs);
      assert.equal(monthlySummary.sessionCount, originalSessionCount);
      assert.equal(monthlySummary.dailySummaries.length, originalDailyLength);
    });
  });
});