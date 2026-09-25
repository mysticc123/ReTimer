/**
 * Streaks analytics tests.
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

function sessionOnDay(dayOffset: number, durationMs: number = 60_000): FocusSession {
  const dayStart = T0 + dayOffset * 24 * 60 * 60 * 1000;
  return {
    id: `session-${dayOffset}`,
    mode: 'countdown',
    phase: 'single',
    plannedDurationMs: durationMs,
    actualDurationMs: durationMs,
    startedAtMs: T0,
    completedAtMs: dayStart,
  };
}

describe('streaks analytics', () => {
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

  it('empty history returns zero streaks', () => {
    const info = analytics.computeStreakInfo([], T0);
    assert.equal(info.currentStreak, 0);
    assert.equal(info.longestStreak, 0);
    assert.equal(info.lastProductiveDay, null);
  });

  it('one productive day gives streak of 1', () => {
    const sessions = [sessionOnDay(0)];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 1);
    assert.equal(info.longestStreak, 1);
    assert.equal(info.lastProductiveDay, analytics.startOfDay(T0));
  });

  it('consecutive days increase current streak', () => {
    const sessions = [
      sessionOnDay(0),   // Today
      sessionOnDay(-1),  // Yesterday
      sessionOnDay(-2),  // Two days ago
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 3);
    assert.equal(info.longestStreak, 3);
  });

  it('broken streak: current streak is 0 when today has no session', () => {
    const sessions = [
      sessionOnDay(-1),  // Yesterday
      sessionOnDay(-2),  // Two days ago
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 0);
    assert.equal(info.longestStreak, 2);
  });

it('multiple sessions on same day count as one productive day', () => {
    const dayStart = T0;
    const sessions = [
      { ...sessionOnDay(0), id: '1', completedAtMs: T0 },
      { ...sessionOnDay(0), id: '2', completedAtMs: T0 - 10_000 },
      { ...sessionOnDay(0), id: '3', completedAtMs: T0 - 20_000 },
      sessionOnDay(-1),
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    // Only 2 unique productive days: today and yesterday
    assert.equal(info.currentStreak, 2);
    assert.equal(info.longestStreak, 2);
  });

  it('broken sequence resets streak', () => {
    const sessions = [
      sessionOnDay(0),   // Today
      sessionOnDay(-1),  // Yesterday
      // Gap: day -2 missing
      sessionOnDay(-3),  // Three days ago
      sessionOnDay(-4),  // Four days ago
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 2); // Today + yesterday
    assert.equal(info.longestStreak, 2); // Two streaks of 2, max is 2
  });

  it('longest streak tracks maximum sequence', () => {
    const sessions = [
      sessionOnDay(0),   // Today
      sessionOnDay(-1),  // Yesterday
      sessionOnDay(-2),  // 2 days ago
      // Gap
      sessionOnDay(-5),  // 5 days ago
      sessionOnDay(-6),  // 6 days ago
      sessionOnDay(-7),  // 7 days ago
      sessionOnDay(-8),  // 8 days ago
      // Gap
      sessionOnDay(-12), // 12 days ago
      sessionOnDay(-13), // 13 days ago
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 3);
    assert.equal(info.longestStreak, 4); // The -5 through -8 sequence
  });

  it('lastProductiveDay is most recent day', () => {
    const sessions = [
      sessionOnDay(-5),
      sessionOnDay(-10),
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.lastProductiveDay, analytics.startOfDay(T0 - 5 * 24 * 60 * 60 * 1000));
  });

  it('single session in past, today empty: current streak = 0', () => {
    const sessions = [sessionOnDay(-5)];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 0);
    assert.equal(info.longestStreak, 1);
  });

  it('current streak ends today even if yesterday had session', () => {
    const sessions = [
      sessionOnDay(-1), // Yesterday
      sessionOnDay(-2), // Two days ago
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 0);
    assert.equal(info.longestStreak, 2);
  });

  it('long streak spanning many days', () => {
    const sessions = [];
    for (let i = 0; i < 30; i++) {
      sessions.push(sessionOnDay(-i));
    }
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 30);
    assert.equal(info.longestStreak, 30);
  });

  it('streak with multiple sessions per day over many days', () => {
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      // 2 sessions per day
      sessions.push(sessionOnDay(-i, 30_000));
      sessions.push({ ...sessionOnDay(-i, 40_000), id: `extra-${i}` });
    }
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 10);
    assert.equal(info.longestStreak, 10);
  });

  it('gap of more than one day breaks streak', () => {
    const sessions = [
      sessionOnDay(0),
      sessionOnDay(-1),
      // Gap of 2 days (-2, -3 missing)
      sessionOnDay(-4),
      sessionOnDay(-5),
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    assert.equal(info.currentStreak, 2);
    assert.equal(info.longestStreak, 2);
  });

  it('invalid sessions are ignored in streak calculation', () => {
    const sessions = [
      sessionOnDay(0),
      { ...sessionOnDay(-1), completedAtMs: -1 }, // invalid
      sessionOnDay(-2),
    ];
    const info = analytics.computeStreakInfo(sessions, T0);
    // Invalid session on day -1 is ignored, so streak is broken
    assert.equal(info.currentStreak, 1);
    assert.equal(info.longestStreak, 1);
  });
});





