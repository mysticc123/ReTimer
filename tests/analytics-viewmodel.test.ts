/**
 * Analytics view-model tests (Issue #15 UI data wiring).
 *
 * Covers the pure view model the Analytics screen renders: empty state,
 * expected displayed values, mode rules, strict future exclusion, and
 * store-completed sessions flowing in. Screen rendering / navigation /
 * theme are verified on-device (no RN rendering framework in this repo).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadAnalytics, loadViewModel, setNowFn } from './helpers/analytics.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';
import type { FocusSession } from './helpers/analytics-types.js';
import type { buildAnalyticsViewModel } from '../src/utils/analyticsViewModel.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ViewModelFn = typeof buildAnalyticsViewModel;

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

describe('analytics view model (Analytics screen wiring)', () => {
  let analytics: Awaited<ReturnType<typeof loadAnalytics>>;
  let viewModel: { buildAnalyticsViewModel: ViewModelFn };

  beforeEach(async () => {
    analytics = await loadAnalytics();
    clock.setNow(T0);
    setNowFn(() => T0);
    viewModel = await loadViewModel();
  });

  afterEach(() => {
    clock.restore();
    setNowFn();
  });

  it('empty history produces the empty state', () => {
    const model = viewModel.buildAnalyticsViewModel([], T0);
    assert.equal(model.hasData, false);
    assert.equal(model.today.focusedMs, 0);
    assert.equal(model.today.sessionCount, 0);
    assert.equal(model.week.focusedMs, 0);
    assert.equal(model.week.sessionCount, 0);
    assert.equal(model.month.focusedMs, 0);
    assert.equal(model.month.sessionCount, 0);
    assert.equal(model.currentStreak, 0);
    assert.equal(model.longestStreak, 0);
  });

  it('valid history produces the expected displayed values', () => {
    const dayStart = analytics.startOfDay(T0);
    const yesterday = dayStart - MS_PER_DAY + 60_000;
    const sessions = [
      makeSession({ completedAtMs: dayStart + 10_000, actualDurationMs: 25 * MIN }),
      makeSession({ completedAtMs: dayStart + 20_000, actualDurationMs: 10 * MIN }),
      makeSession({ completedAtMs: yesterday, actualDurationMs: 30 * MIN }),
    ];
    const model = viewModel.buildAnalyticsViewModel(sessions, T0);

    assert.equal(model.hasData, true);
    assert.equal(model.today.focusedMs, 35 * MIN);
    assert.equal(model.today.sessionCount, 2);
    // T0 is Tuesday: yesterday (Monday) is in the same week and month.
    assert.equal(model.week.focusedMs, 65 * MIN);
    assert.equal(model.week.sessionCount, 3);
    assert.equal(model.month.focusedMs, 65 * MIN);
    assert.equal(model.month.sessionCount, 3);
    // Productive today + yesterday => current 2, longest 2.
    assert.equal(model.currentStreak, 2);
    assert.equal(model.longestStreak, 2);
  });

  it('included focus modes are all represented', () => {
    const sessions = [
      makeSession({ mode: 'pomodoro', phase: 'focus', actualDurationMs: 25 * MIN }),
      makeSession({ mode: 'countdown', phase: 'single', actualDurationMs: 15 * MIN }),
      makeSession({ mode: 'interval', phase: 'work', round: 0, totalRounds: 4, actualDurationMs: 5 * MIN }),
    ];
    const model = viewModel.buildAnalyticsViewModel(sessions, T0);
    assert.equal(model.hasData, true);
    assert.equal(model.today.sessionCount, 3);
    assert.equal(model.today.focusedMs, 45 * MIN);
    assert.equal(model.week.sessionCount, 3);
    assert.equal(model.currentStreak, 1);
  });

  it('future sessions are not surfaced anywhere', () => {
    const valid = makeSession({ completedAtMs: T0, actualDurationMs: 20 * MIN });
    const future = makeSession({ completedAtMs: T0 + 60_000, actualDurationMs: 40 * MIN });
    const model = viewModel.buildAnalyticsViewModel([valid, future], T0);

    assert.equal(model.hasData, true);
    assert.equal(model.today.sessionCount, 1);
    assert.equal(model.today.focusedMs, 20 * MIN);
    assert.equal(model.week.sessionCount, 1);
    assert.equal(model.week.focusedMs, 20 * MIN);
    assert.equal(model.month.sessionCount, 1);
    assert.equal(model.month.focusedMs, 20 * MIN);
  });

  it('history with only future sessions yields the empty state', () => {
    const future = makeSession({ completedAtMs: T0 + MIN });
    const model = viewModel.buildAnalyticsViewModel([future], T0);
    assert.equal(model.hasData, false);
    assert.equal(model.today.sessionCount, 0);
    assert.equal(model.week.focusedMs, 0);
    assert.equal(model.currentStreak, 0);
  });

  it('store-completed session flows into displayed values', async () => {
    const app: LoadedApp = await loadStores();
    clock.setNow(T0);
    // Track the mocked wall clock so the completion timestamp is never
    // in the future relative to the analytics validation reference.
    setNowFn(() => Date.now());
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 65_000);
    api.startTimer();
    clock.advance(5_000);
    api.completeTimer();

    const sessions = app.useTimerStore.getState().sessions;
    const model = viewModel.buildAnalyticsViewModel(sessions, Date.now());
    assert.equal(model.hasData, true);
    assert.equal(model.today.sessionCount, 1);
    assert.equal(model.today.focusedMs, 65_000);
    assert.equal(model.week.sessionCount, 1);
    assert.equal(model.currentStreak, 1);
    assert.equal(model.longestStreak, 1);
  });
});
