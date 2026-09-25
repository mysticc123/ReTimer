/**
 * Daily aggregation analytics tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadAnalytics, setNowFn } from './helpers/analytics.js';
import type { FocusSession } from './helpers/analytics.js';

const T0 = 1_700_000_000_000;
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

describe('daily aggregation', () => {
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

  it('empty history returns empty daily summaries', () => {
    const sessions: FocusSession[] = [];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.deepEqual(summaries, []);
  });

  it('one session on a day returns correct summary', () => {
    const dayStart = analytics.startOfDay(T0);
    const session = makeSession({
      completedAtMs: T0,
      actualDurationMs: 50_000,
    });
    const summaries = analytics.buildDailySummaries([session]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].dayStart, dayStart);
    assert.equal(summaries[0].focusedMs, 50_000);
    assert.equal(summaries[0].sessionCount, 1);
  });

  it('multiple sessions on same day aggregate correctly', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [
      makeSession({ completedAtMs: T0 - 10_000, actualDurationMs: 30_000 }),
      makeSession({ completedAtMs: T0 - 20_000, actualDurationMs: 20_000 }),
      makeSession({ completedAtMs: T0 - 30_000, actualDurationMs: 10_000 }),
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].dayStart, dayStart);
    assert.equal(summaries[0].focusedMs, 60_000);
    assert.equal(summaries[0].sessionCount, 3);
  });

  it('multiple days are separated correctly', () => {
    const day1 = analytics.startOfDay(T0);
    const day2 = day1 - 24 * 60 * 60 * 1000; // previous day
    const sessions = [
      makeSession({ completedAtMs: T0 - 10_000, actualDurationMs: 30_000 }),
      makeSession({ completedAtMs: day2 + 10_000, actualDurationMs: 40_000 }),
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 2);
    // buildDailySummaries returns summaries sorted by dayStart ascending (oldest first)
    assert.equal(summaries[0].dayStart, day2);
    assert.equal(summaries[0].focusedMs, 40_000);
    assert.equal(summaries[1].dayStart, day1);
    assert.equal(summaries[1].focusedMs, 30_000);
  });

  it('session exactly at midnight boundary attributed to correct day', () => {
    const dayStart = analytics.startOfDay(T0);
    const prevDayStart = analytics.startOfDay(T0) - 24 * 60 * 60 * 1000;
    const sessions = [
      makeSession({ completedAtMs: dayStart, actualDurationMs: 10_000 }),
      makeSession({ completedAtMs: prevDayStart, actualDurationMs: 20_000 }),
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 2);
    // buildDailySummaries returns summaries sorted by dayStart ascending (oldest first)
    assert.equal(summaries[0].dayStart, prevDayStart);
    assert.equal(summaries[0].focusedMs, 20_000);
    assert.equal(summaries[1].dayStart, dayStart);
    assert.equal(summaries[1].focusedMs, 10_000);
  });

  it('late-night completion attributed to completion day', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [
      makeSession({ completedAtMs: T0 - 10_000, actualDurationMs: 10_000 }),
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].dayStart, dayStart);
  });

  it('buildDailySummary returns null for empty day', () => {
    const dayStart = analytics.startOfDay(T0);
    const summary = analytics.buildDailySummary([], dayStart);
    assert.equal(summary, null);
  });

  it('buildDailySummary returns correct summary for day with sessions', () => {
    const dayStart = analytics.startOfDay(T0);
    const session = makeSession({
      completedAtMs: T0,
      actualDurationMs: 50_000,
    });
    const summary = analytics.buildDailySummary([session], dayStart);
    assert.notEqual(summary, null);
    assert.equal(summary!.dayStart, dayStart);
    assert.equal(summary!.focusedMs, 50_000);
    assert.equal(summary!.sessionCount, 1);
  });

  it('buildDailySummary returns null when no sessions match day', () => {
    const dayStart = analytics.startOfDay(T0);
    const otherDay = dayStart - 24 * 60 * 60 * 1000;
    const session = makeSession({ completedAtMs: otherDay });
    const summary = analytics.buildDailySummary([session], dayStart);
    assert.equal(summary, null);
  });

  it('calculateFocusedTime sums correctly', () => {
    const sessions = [
      makeSession({ actualDurationMs: 30_000 }),
      makeSession({ actualDurationMs: 20_000 }),
      makeSession({ actualDurationMs: 10_000 }),
    ];
    assert.equal(analytics.calculateFocusedTime(sessions), 60_000);
  });

  it('calculateFocusedTime returns 0 for empty array', () => {
    assert.equal(analytics.calculateFocusedTime([]), 0);
  });

  it('calculateSessionCount counts correctly', () => {
    const sessions = [
      makeSession({}),
      makeSession({}),
      makeSession({}),
    ];
    assert.equal(analytics.calculateSessionCount(sessions), 3);
  });

  it('calculateSessionCount returns 0 for empty array', () => {
    assert.equal(analytics.calculateSessionCount([]), 0);
  });

  it('invalid sessions are excluded from daily summaries', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [
      makeSession({ completedAtMs: T0 - 10_000, actualDurationMs: 30_000 }),
      { ...makeSession(), completedAtMs: -1, actualDurationMs: 50_000 }, // invalid timestamp
      { ...makeSession(), completedAtMs: T0, actualDurationMs: -5_000 }, // invalid duration
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].focusedMs, 30_000);
    assert.equal(summaries[0].sessionCount, 1);
  });

  it('sessions spanning midnight are attributed to completion day only', () => {
    const day1 = analytics.startOfDay(T0);
    const day2 = day1 - 24 * 60 * 60 * 1000;
    // Session starts day1, ends day2 (previous day)
    const sessions = [
      makeSession({
        startedAtMs: day1 + 23 * 60 * 60 * 1000 - 3_600_000,
        completedAtMs: day2 + 10_000, // just after midnight on day2
        actualDurationMs: 3_600_000, // 1 hour
      }),
    ];
    const summaries = analytics.buildDailySummaries(sessions);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].dayStart, day2); // attributed to completion day
  });
});