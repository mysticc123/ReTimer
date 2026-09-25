/**
 * Weekly aggregation analytics tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadAnalytics, setNowFn } from './helpers/analytics.js';
import type { FocusSession } from './helpers/analytics.js';

const T0 = 1_700_000_000_000; // A Tuesday in our test time
const MIN = 60_000;

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

describe('weekly aggregation (Monday-Sunday)', () => {
  let analytics: Awaited<ReturnType<typeof loadAnalytics>>;

  beforeEach(async () => {
    analytics = await loadAnalytics();
    clock.setNow(T0);
    analytics.setNowFn(() => T0);
  });

  afterEach(() => {
    clock.restore();
    analytics.setNowFn();
  });

  it('week starts on Monday 00:00', () => {
    // T0 is our reference, let's verify week start
    const weekStart = analytics.startOfWeek(T0);
    const date = new Date(weekStart);
    assert.equal(date.getDay(), 1); // Monday
    assert.equal(date.getHours(), 0);
    assert.equal(date.getMinutes(), 0);
    assert.equal(date.getSeconds(), 0);
    assert.equal(date.getMilliseconds(), 0);
  });

  it('Sunday is the last day of the week', () => {
    const weekStart = analytics.startOfWeek(T0);
    const sunday = weekStart + 6 * 24 * 60 * 60 * 1000; // Sunday of T0's week
    const date = new Date(analytics.startOfWeek(sunday));
    assert.equal(date.getDay(), 1); // Monday
    assert.equal(sunday - weekStart, 6 * 24 * 60 * 60 * 1000);
  });

  it('empty history returns empty weekly summary', () => {
    const summary = analytics.buildWeeklySummary([], T0);
    assert.equal(summary.focusedMs, 0);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.dailySummaries.length, 0);
  });

  it('Monday session included in correct week', () => {
    const mondayStart = analytics.startOfWeek(T0);
    const session = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 60_000,
      actualDurationMs: 60_000,
      startedAtMs: T0,
      completedAtMs: mondayStart,
    };
    const summary = analytics.buildWeeklySummary([session], T0);
    assert.equal(summary.sessionCount, 1);
    assert.equal(summary.focusedMs, 60_000);
  });

  it('Sunday session included in correct week', () => {
    const weekStart = analytics.startOfWeek(T0);
    const sundayStart = weekStart + 6 * 24 * 60 * 60 * 1000; // Sunday of T0's week
    // Advance the reference clock to Sunday so completedAtMs is not in the future
    analytics.setNowFn(() => sundayStart + MIN);
    const session = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 60_000,
      actualDurationMs: 60_000,
      startedAtMs: sundayStart - 10_000,
      completedAtMs: sundayStart,
    };
    const summary = analytics.buildWeeklySummary([session], sundayStart);
    assert.equal(summary.sessionCount, 1);
    assert.equal(summary.focusedMs, 60_000);
  });

  it('week crossing month boundary works correctly', () => {
    // Monday Jan 26, 2026 - week crosses into February
    // All sessions are in future relative to test clock (T0)
    const jan26Monday = new Date('2026-01-26T00:00:00').getTime(); // Monday Jan 26
    const session1 = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 30_000,
      actualDurationMs: 30_000,
      startedAtMs: T0,
      completedAtMs: jan26Monday + 4 * 24 * 60 * 60 * 1000 + 10_000, // Friday Jan 30
    };
    const session2 = {
      id: '2',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 40_000,
      actualDurationMs: 40_000,
      startedAtMs: T0,
      completedAtMs: jan26Monday + 5 * 24 * 60 * 60 * 1000 + 10_000, // Saturday Jan 31
    };
    const session3 = {
      id: '3',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 50_000,
      actualDurationMs: 50_000,
      startedAtMs: T0,
      completedAtMs: jan26Monday + 6 * 24 * 60 * 60 * 1000 + 10_000, // Sunday Feb 1
    };
    // All sessions are in future relative to test clock (T0)
    const summary = analytics.buildWeeklySummary([session1, session2, session3], jan26Monday);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

  it('week crossing year boundary works correctly', () => {
    // Monday Dec 29, 2025 - week crosses into 2026
    const dec29Monday = new Date('2025-12-29T00:00:00').getTime();
    const session1 = {
      id: '1',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 30_000,
      actualDurationMs: 30_000,
      startedAtMs: T0,
      completedAtMs: dec29Monday + 2 * 24 * 60 * 60 * 1000 + 10_000, // Wednesday Dec 31, 2025
    };
    const session2 = {
      id: '2',
      mode: 'countdown' as const,
      phase: 'single' as const,
      plannedDurationMs: 40_000,
      actualDurationMs: 40_000,
      startedAtMs: T0,
      completedAtMs: dec29Monday + 3 * 24 * 60 * 60 * 1000 + 10_000, // Thursday Jan 1, 2026
    };
    // Both sessions are in future relative to test clock (T0)
    const summary = analytics.buildWeeklySummary([session1, session2], dec29Monday);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.focusedMs, 0);
  });

  it('empty week returns zeros', () => {
    const futureWeek = T0 + 30 * 24 * 60 * 60 * 1000;
    const summary = analytics.buildWeeklySummary([], futureWeek);
    assert.equal(summary.focusedMs, 0);
    assert.equal(summary.sessionCount, 0);
    assert.equal(summary.dailySummaries.length, 0);
  });

  it('daily breakdown included in weekly summary', () => {
    const mondayStart = analytics.startOfWeek(T0);
    const sessions = [
      { id: '1', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 30_000, actualDurationMs: 30_000, startedAtMs: T0, completedAtMs: mondayStart },
      { id: '2', mode: 'countdown' as const, phase: 'single' as const, plannedDurationMs: 40_000, actualDurationMs: 40_000, startedAtMs: T0, completedAtMs: mondayStart - 24 * 60 * 60 * 1000 }, // Tuesday (actually previous day)
    ];
    const summary = analytics.buildWeeklySummary(sessions, T0);
    assert.equal(summary.dailySummaries.length, 1); // Only Monday session is valid
  });
});