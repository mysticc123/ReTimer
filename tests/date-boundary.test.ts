/**
 * Date-boundary refresh (Issue F-03).
 *
 * A screen mounted across local midnight must recompute its date-relative
 * UI without requiring a new session. The screens achieve this with a
 * day-keyed memo dependency; these tests prove the underlying pure
 * computation returns the correct buckets for successive reference times
 * over the SAME unchanged session array:
 * - History: buildSections(sessions, now) moves sessions Today→Yesterday→Earlier.
 * - Analytics: buildAnalyticsViewModel(sessions, now) re-anchors Today,
 *   streaks, week, and month when `now` crosses a boundary.
 *
 * Screen-level listener wiring (AppState/focus bumping the day key) is
 * verified by inspection + on-device (no RN renderer exists in this repo).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as clock from './helpers/clock.js';
import { loadAnalytics, loadViewModel, setNowFn } from './helpers/analytics.js';
import type { FocusSession } from './helpers/analytics-types.js';
import type * as HistoryModule from '../src/utils/history.js';

const req = createRequire(process.cwd() + '/package.json');
const history = req(
  process.cwd() + '/.test-build/src/utils/history.js'
) as typeof HistoryModule;

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DAY = 24 * 60 * 60 * 1000;

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: `${overrides.completedAtMs ?? T0}-${Math.random()}`,
    mode: 'countdown',
    phase: 'single',
    plannedDurationMs: 60_000,
    actualDurationMs: 60_000,
    startedAtMs: T0,
    completedAtMs: T0,
    ...overrides,
  };
}

describe('history date-boundary refresh', () => {
  let startOfDayFn: (timestamp: number) => number;

  beforeEach(async () => {
    const analytics = await loadAnalytics();
    startOfDayFn = analytics.startOfDay;
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('session completed before midnight appears in Today', () => {
    const dayStart = startOfDayFn(T0);
    const sessions = [makeSession({ completedAtMs: dayStart + 10 * MIN })];
    const now = dayStart + 23 * 60 * MIN; // 23:00 same day
    const sections = history.buildSections(sessions, now);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Today');
    assert.equal(sections[0].data.length, 1);
  });

  it('same sessions with reference time past midnight move Today to Yesterday', () => {
    const dayStart = startOfDayFn(T0);
    const sessions = [makeSession({ completedAtMs: dayStart + 10 * MIN })];
    // No new session is created: the identical array is re-bucketed with a
    // later reference time, mirroring the day-keyed memo recompute.
    const afterMidnight = startOfDayFn(dayStart + DAY) + MIN; // next day 00:01
    const sections = history.buildSections(sessions, afterMidnight);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Yesterday');
    assert.equal(sections[0].data.length, 1);
    assert.ok(!sections.some((section) => section.title === 'Today'));
  });

  it('sessions older than yesterday appear under Earlier', () => {
    const dayStart = startOfDayFn(T0);
    const sessions = [makeSession({ completedAtMs: dayStart + 10 * MIN })];
    const twoDaysLater = startOfDayFn(dayStart + 3 * DAY) + MIN;
    const sections = history.buildSections(sessions, twoDaysLater);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Earlier');
  });

  it('sessions split across days keep newest-first order within each bucket', () => {
    const dayStart = startOfDayFn(T0);
    const sessions = [
      makeSession({ completedAtMs: dayStart - 2 * DAY + 5 * MIN }),
      makeSession({ completedAtMs: dayStart + 30 * MIN }),
      makeSession({ completedAtMs: dayStart + 10 * MIN }),
      makeSession({ completedAtMs: dayStart - DAY + 5 * MIN }),
    ];
    const now = dayStart + 12 * 60 * MIN;
    const sections = history.buildSections(sessions, now);
    assert.deepEqual(
      sections.map((section) => section.title),
      ['Today', 'Yesterday', 'Earlier']
    );
    const today = sections[0].data;
    assert.ok(today[0].completedAtMs > today[1].completedAtMs);
  });

  it('empty history stays empty across the boundary', () => {
    const dayStart = startOfDayFn(T0);
    assert.deepEqual(history.buildSections([], dayStart + 23 * 60 * MIN), []);
    assert.deepEqual(history.buildSections([], startOfDayFn(dayStart + 2 * DAY) + MIN), []);
  });
});

describe('analytics date-boundary refresh', () => {
  let viewModel: Awaited<ReturnType<typeof loadViewModel>>;
  let analytics: Awaited<ReturnType<typeof loadAnalytics>>;

  beforeEach(async () => {
    analytics = await loadAnalytics();
    clock.setNow(T0);
    viewModel = await loadViewModel();
  });

  afterEach(() => {
    clock.restore();
    setNowFn();
  });

  it('yesterday session counts today, then drops out after midnight with streak reset', () => {
    const dayStart = analytics.startOfDay(T0);
    const sessions = [makeSession({ completedAtMs: dayStart - 2 * 60 * MIN })]; // yesterday 22:00

    const lastNight = dayStart - 60 * MIN; // yesterday 23:00
    setNowFn(() => lastNight);
    const before = viewModel.buildAnalyticsViewModel(sessions, lastNight);
    assert.equal(before.today.sessionCount, 1);
    assert.equal(before.currentStreak, 1);

    // Same array, reference time advanced past midnight: the session must
    // not count as today's, and the current streak must end.
    const thisMorning = dayStart + 30 * MIN; // today 00:30
    setNowFn(() => thisMorning);
    const after = viewModel.buildAnalyticsViewModel(sessions, thisMorning);
    assert.equal(after.today.sessionCount, 0);
    assert.equal(after.today.focusedMs, 0);
    assert.equal(after.currentStreak, 0);
    assert.equal(after.longestStreak, 1);
    assert.equal(after.hasData, true);
  });

  it('week boundary excludes the prior week without a new session', () => {
    const monday = analytics.startOfWeek(T0);
    const sessions = [makeSession({ completedAtMs: monday + 60 * MIN })];
    const sundayNoon = monday + 6 * DAY + 12 * 60 * MIN;
    setNowFn(() => sundayNoon);
    const inWeek = viewModel.buildAnalyticsViewModel(sessions, sundayNoon);
    assert.equal(inWeek.week.sessionCount, 1);

    const nextMonday = analytics.startOfWeek(monday + 7 * DAY) + MIN;
    setNowFn(() => nextMonday);
    const nextWeek = viewModel.buildAnalyticsViewModel(sessions, nextMonday);
    assert.equal(nextWeek.week.sessionCount, 0);
    assert.equal(nextWeek.week.focusedMs, 0);
  });

  it('month boundary excludes the prior month without a new session', () => {
    const nextMonthStart = analytics.startOfNextMonth(T0);
    // Noon on the last day of the current month (always exists, DST-safe).
    const lastDayNoon = nextMonthStart - 12 * 60 * MIN;
    const sessions = [makeSession({ completedAtMs: lastDayNoon })];
    setNowFn(() => nextMonthStart - MIN);
    const inMonth = viewModel.buildAnalyticsViewModel(sessions, nextMonthStart - MIN);
    assert.equal(inMonth.month.sessionCount, 1);

    const firstOfNext = nextMonthStart + MIN;
    setNowFn(() => firstOfNext);
    const nextMonth = viewModel.buildAnalyticsViewModel(sessions, firstOfNext);
    assert.equal(nextMonth.month.sessionCount, 0);
    assert.equal(nextMonth.month.focusedMs, 0);
  });
});
