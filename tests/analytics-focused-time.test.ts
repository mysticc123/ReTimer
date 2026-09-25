/**
 * Focused time and session count analytics tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadAnalytics, setNowFn } from './helpers/analytics.js';
import type { FocusSession } from './helpers/analytics.js';

const T0 = 1_700_000_000_000;

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

describe('focused time and session count', () => {
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

  it('sum accuracy with multiple sessions', () => {
    const sessions = [
      { ...makeSession(), actualDurationMs: 30_000 },
      { ...makeSession(), actualDurationMs: 20_000 },
      { ...makeSession(), actualDurationMs: 10_000 },
    ];
    assert.equal(analytics.calculateFocusedTime(sessions), 60_000);
  });

  it('zero sessions returns zero focused time', () => {
    assert.equal(analytics.calculateFocusedTime([]), 0);
  });

  it('multiple sessions same day aggregated correctly', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [
      { ...makeSession(), completedAtMs: T0 - 10_000, actualDurationMs: 30_000 },
      { ...makeSession(), completedAtMs: T0 - 20_000, actualDurationMs: 20_000 },
      { ...makeSession(), completedAtMs: T0 - 30_000, actualDurationMs: 10_000 },
    ];
    const summary = analytics.buildDailySummary(sessions, dayStart);
    assert.notEqual(summary, null);
    assert.equal(summary!.focusedMs, 60_000);
    assert.equal(summary!.sessionCount, 3);
  });

  it('large totals do not overflow', () => {
    // Simulate ~1000 hours of focused time
    const sessions = [];
    for (let i = 0; i < 1000; i++) {
      sessions.push(makeSession({ actualDurationMs: 3_600_000 })); // 1 hour each
    }
    const total = analytics.calculateFocusedTime(sessions);
    assert.equal(total, 1000 * 3_600_000);
  });

  it('session count matches number of valid sessions', () => {
    const sessions = [
      makeSession({}),
      makeSession({}),
      makeSession({}),
    ];
    assert.equal(analytics.calculateSessionCount(sessions), 3);
  });

  it('session count excludes invalid sessions', () => {
    const sessions = [
      makeSession({}),
      { ...makeSession(), completedAtMs: -1 }, // invalid
      makeSession({}),
    ];
    assert.equal(analytics.calculateSessionCount(sessions), 2);
  });

  it('duplicate sessions on same day counted individually in session count', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [
      { ...makeSession(), completedAtMs: T0 - 10_000, actualDurationMs: 30_000 },
      { ...makeSession(), completedAtMs: T0 - 20_000, actualDurationMs: 20_000 },
      { ...makeSession(), completedAtMs: T0 - 30_000, actualDurationMs: 10_000 },
    ];
    const summary = analytics.buildDailySummary(sessions, dayStart);
    assert.notEqual(summary, null);
    assert.equal(summary!.sessionCount, 3); // All three counted
  });

  it('session count zero for empty history', () => {
    assert.equal(analytics.calculateSessionCount([]), 0);
  });

  it('focused time zero for empty history', () => {
    assert.equal(analytics.calculateFocusedTime([]), 0);
  });

  it('negative actualDurationMs excluded', () => {
    const sessions = [
      makeSession({ actualDurationMs: 60_000 }),
      { ...makeSession(), actualDurationMs: -10_000 },
    ];
    assert.equal(analytics.calculateFocusedTime(sessions), 60_000);
  });

  it('non-finite actualDurationMs excluded', () => {
    const sessions = [
      makeSession({ actualDurationMs: 60_000 }),
      { ...makeSession(), actualDurationMs: NaN },
      { ...makeSession(), actualDurationMs: Infinity },
    ];
    assert.equal(analytics.calculateFocusedTime(sessions), 60_000);
  });

  it('non-finite completedAtMs excluded', () => {
    const sessions = [
      makeSession({ completedAtMs: T0 }),
      { ...makeSession(), completedAtMs: NaN },
      { ...makeSession(), completedAtMs: Infinity },
    ];
    const summary = analytics.buildDailySummary(sessions, analytics.startOfDay(T0));
    assert.notEqual(summary, null);
    assert.equal(summary!.sessionCount, 1);
    assert.equal(summary!.focusedMs, 60_000);
  });

  it('non-finite startedAtMs does not invalidate session', () => {
    // startedAtMs is not used for validation in current implementation
    const sessions = [
      { ...makeSession(), startedAtMs: NaN, completedAtMs: T0, actualDurationMs: 60_000 },
    ];
    const summary = analytics.buildDailySummary(sessions, analytics.startOfDay(T0));
    assert.notEqual(summary, null);
    assert.equal(summary!.sessionCount, 1);
    assert.equal(summary!.focusedMs, 60_000);
  });

  it('non-finite plannedDurationMs does not invalidate session', () => {
    const sessions = [
      { ...makeSession(), plannedDurationMs: Infinity, completedAtMs: T0, actualDurationMs: 60_000 },
    ];
    const summary = analytics.buildDailySummary(sessions, analytics.startOfDay(T0));
    assert.notEqual(summary, null);
    assert.equal(summary!.sessionCount, 1);
    assert.equal(summary!.focusedMs, 60_000);
  });
});