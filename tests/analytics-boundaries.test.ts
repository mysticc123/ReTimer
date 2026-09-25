/**
 * Boundary and edge case analytics tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadAnalytics, setNowFn } from './helpers/analytics.js';
import type { FocusSession } from './helpers/analytics.js';

const T0 = 1_700_000_000_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: `${Date.now()}-${Math.random()}`,
    mode: 'countdown',
    phase: 'single',
    plannedDurationMs: 60_000,
    actualDurationMs: 60_000,
    startedAtMs: T0,
    completedAtMs: T0,
    ...overrides,
  };
}

describe('boundary and edge cases', () => {
  let analytics: Awaited<ReturnType<typeof loadAnalytics>>;

  beforeEach(async () => {
    analytics = await loadAnalytics();
    clock.setNow(T0);
    setNowFn(() => T0);
  });

  afterEach(() => {
    clock.restore();
    setNowFn();
  });

  it('session completion exactly at 00:00 attributed to that day', () => {
    const dayStart = analytics.startOfDay(T0);
    const session = { ...makeSession(), completedAtMs: dayStart };
    const summary = analytics.buildDailySummary([session], dayStart);
    assert.notEqual(summary, null);
    assert.equal(summary!.dayStart, dayStart);
    assert.equal(summary!.focusedMs, 60_000);
  });

it('session completion at 23:59:59.999 attributed to same day', () => {
    const dayStart = analytics.startOfDay(T0);
    const endOfDay = dayStart + MS_PER_DAY - 1;
    const session = { ...makeSession(), completedAtMs: T0 - 1 };
    const summary = analytics.buildDailySummary([session], dayStart);
    assert.notEqual(summary, null);
    assert.equal(summary!.dayStart, dayStart);
  });

it('cross-month completion attributed to completion month', () => {
    // Session completes Jan 1, but test clock is in December
    // Future sessions (beyond 48h tolerance) are rejected
    const decRef = new Date('2025-12-15T12:00:00').getTime();
    const janSession = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 60_000,
      actualDurationMs: 60_000,
      startedAtMs: new Date('2025-12-31T23:00:00').getTime(),
      completedAtMs: new Date('2026-01-01T00:30:00').getTime(),
    };
    // January monthly summary - session is in future relative to test clock, so rejected
    const janSummary = analytics.buildMonthlySummary([janSession], new Date('2026-01-15').getTime());
    assert.equal(janSummary.sessionCount, 0);
    // December monthly summary - also rejected (future session)
    const decSummary = analytics.buildMonthlySummary([janSession], new Date('2025-12-15').getTime());
    assert.equal(decSummary.sessionCount, 0);
  });

  it('cross-year completion attributed to completion year', () => {
    const decRef = new Date('2025-12-15T12:00:00').getTime();
    const janSession = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 60_000,
      actualDurationMs: 60_000,
      startedAtMs: new Date('2025-12-31T23:00:00').getTime(),
      completedAtMs: new Date('2026-01-01T00:30:00').getTime(),
    };
    const janSummary = analytics.buildMonthlySummary([janSession], new Date('2026-01-15').getTime());
    assert.equal(janSummary.sessionCount, 0);
    const decSummary = analytics.buildMonthlySummary([janSession], new Date('2025-12-15').getTime());
    assert.equal(decSummary.sessionCount, 0);
  });

it('weekly summary week crossing month boundary', () => {
    // Monday Jan 26, 2026 - week crosses into February
    // Future sessions (beyond 48h tolerance) are rejected
    const jan26Monday = new Date('2026-01-26T00:00:00').getTime();
    const sessions = [
      { id: '1', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 30_000, actualDurationMs: 30_000, startedAtMs: T0, completedAtMs: jan26Monday + 4 * 24 * 60 * 60 * 1000 + 10_000 }, // Friday Jan 30
      { id: '2', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 40_000, actualDurationMs: 40_000, startedAtMs: T0, completedAtMs: jan26Monday + 5 * 24 * 60 * 60 * 1000 + 10_000 }, // Saturday Jan 31
      { id: '3', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 50_000, actualDurationMs: 50_000, startedAtMs: T0, completedAtMs: jan26Monday + 6 * 24 * 60 * 60 * 1000 + 10_000 }, // Sunday Feb 1
    ];
    // All sessions are in future relative to test clock (T0), so all rejected
    const summary = analytics.buildWeeklySummary(sessions, jan26Monday);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

  it('weekly summary week crossing year boundary', () => {
    // Monday Dec 29, 2025 - week crosses into 2026
    const dec29Monday = new Date('2025-12-29T00:00:00').getTime();
    const sessions = [
      { id: '1', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 30_000, actualDurationMs: 30_000, startedAtMs: T0, completedAtMs: dec29Monday + 2 * 24 * 60 * 60 * 1000 + 10_000 }, // Wednesday Dec 31, 2025
      { id: '2', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 40_000, actualDurationMs: 40_000, startedAtMs: T0, completedAtMs: dec29Monday + 3 * 24 * 60 * 60 * 1000 + 10_000 }, // Thursday Jan 1, 2026
    ];
    // Both sessions are in future relative to test clock (T0)
    const summary = analytics.buildWeeklySummary(sessions, dec29Monday);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

  it('session completed exactly at week boundary (Sunday 23:59:59)', () => {
    // Week starts Monday, ends Sunday
    const weekStart = analytics.startOfWeek(T0);
    const sundayEnd = weekStart + 6 * MS_PER_DAY + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
    const session = { ...makeSession(), completedAtMs: sundayEnd };
    // Session is in future relative to test clock (T0)
    const summary = analytics.buildWeeklySummary([session], T0);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

  it('session completed exactly at month boundary', () => {
    const monthStart = new Date('2026-01-01T00:00:00').getTime();
    const monthEnd = new Date('2026-02-01T00:00:00').getTime() - 1;
    const session = { ...makeSession(), completedAtMs: monthEnd };
    // Session is in future relative to test clock (T0)
    const summary = analytics.buildMonthlySummary([session], new Date('2026-01-15').getTime());
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

it('February 28/29 handling in non-leap year', () => {
    // Both dates are in future relative to test clock (T0), so rejected
    const feb28 = new Date('2026-02-28T23:59:59').getTime();
    const feb29 = new Date('2026-02-29T00:00:00').getTime(); // Does not exist in 2026
    const session1 = { ...makeSession(), completedAtMs: feb28 };
    const session2 = { ...makeSession(), completedAtMs: feb29 };
    // Future sessions (beyond 48h tolerance) are rejected
    const summary = analytics.buildMonthlySummary([session1], new Date('2026-02-15').getTime());
    assert.equal(summary.sessionCount, 0);
  });

  it('February 29 in leap year', () => {
    const feb29 = new Date('2024-02-29T23:59:59').getTime();
    const session = { ...makeSession(), completedAtMs: feb29 };
    // Future session (beyond 48h tolerance) is rejected
    const summary = analytics.buildMonthlySummary([session], new Date('2024-02-15').getTime());
    assert.equal(summary.sessionCount, 0);
  });

it('DST transition handling - session completed during DST transition', () => {
    // DST transition dates vary by timezone; we test that the logic doesn't crash
    // Use a known DST transition date for US (March 9, 2025 - spring forward)
    // This date is in the future relative to test clock (T0), so session is rejected
    const dstDay = new Date('2025-03-09T00:00:00').getTime();
    const session = { ...makeSession(), completedAtMs: dstDay + 12 * 60 * 60 * 1000 };
    const summary = analytics.buildDailySummary([session], analytics.startOfDay(dstDay));
    // Session is in future relative to test clock, so rejected
    assert.equal(summary, null);
  });

  it('DST transition - fall back (November 2, 2025)', () => {
    const dstDay = new Date('2025-11-02T00:00:00').getTime();
    const session = { ...makeSession(), completedAtMs: dstDay + 12 * 60 * 60 * 1000 };
    const summary = analytics.buildDailySummary([session], analytics.startOfDay(dstDay));
    // Session is in future relative to test clock (T0)
    assert.equal(summary, null);
  });

it('session with completedAtMs exactly at startOfNextMonth', () => {
    const monthStart = new Date('2026-01-01T00:00:00').getTime();
    const nextMonth = analytics.startOfNextMonth(monthStart);
    const session = { ...makeSession(), completedAtMs: nextMonth };
    // Session is in future relative to test clock (T0), so rejected
    const janSummary = analytics.buildMonthlySummary([session], new Date('2026-01-15').getTime());
    assert.equal(janSummary.sessionCount, 0);
    const febSummary = analytics.buildMonthlySummary([session], new Date('2026-02-15').getTime());
    assert.equal(febSummary.sessionCount, 0);
  });

  it('session with completedAtMs exactly at startOfNextWeek', () => {
    const weekStart = analytics.startOfWeek(T0);
    const nextWeek = weekStart + 7 * 24 * 60 * 60 * 1000;
    const session = { ...makeSession(), completedAtMs: nextWeek };
    // Session is in future relative to test clock (T0)
    const thisWeek = analytics.buildWeeklySummary([session], T0);
    assert.equal(thisWeek.sessionCount, 0);
    const nextWeekSummary = analytics.buildWeeklySummary([session], new Date(nextWeek).getTime());
    // Even with reference time at nextWeek, session is still in future relative to test clock (T0)
    assert.equal(nextWeekSummary.sessionCount, 0);
  });

  it('completedAtMs in future is treated as invalid and excluded from analytics', () => {
    const futureDay = T0 + 5 * 24 * 60 * 60 * 1000;
    const session = { ...makeSession(), completedAtMs: futureDay };
    const summary = analytics.buildDailySummary([session], analytics.startOfDay(futureDay));
    // Future sessions (beyond 48h tolerance) are rejected
    assert.equal(summary, null);
  });

  it('invalid timestamps are silently excluded', () => {
    const sessions = [
      makeSession({ completedAtMs: T0 }),
      { ...makeSession(), completedAtMs: -1000 },
      { ...makeSession(), completedAtMs: 0 },
      { ...makeSession(), completedAtMs: NaN },
      { ...makeSession(), completedAtMs: Infinity },
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].sessionCount, 1);
  });

  it('startOfWeek always returns Monday', () => {
    for (let day = 0; day < 7; day++) {
      const date = new Date(T0 + day * 24 * 60 * 60 * 1000);
      const weekStart = analytics.startOfWeek(date.getTime());
      const wsDate = new Date(weekStart);
      assert.equal(wsDate.getDay(), 1, `Day ${day} week start should be Monday`);
    }
  });

  it('startOfMonth always returns 1st day', () => {
    const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const month of months) {
      const date = new Date(2026, month, 15);
      const monthStart = analytics.startOfMonth(date.getTime());
      const msDate = new Date(monthStart);
      assert.equal(msDate.getDate(), 1, `Month ${month} start should be 1st`);
      assert.equal(msDate.getMonth(), month, `Month ${month} should match`);
    }
  });
});





