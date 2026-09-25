/**
 * P9 Countdown Repeat — deterministic tests.
 *
 * Covers the existing `timerCompletionBehavior` setting made functional for
 * Countdown: 'stop' ends the timer after one cycle (unchanged legacy
 * behavior); 'repeat' records the finished cycle exactly once and starts a
 * fresh running Countdown cycle with the same duration. 'continue' is
 * retained for compatibility and behaves as 'stop'. Every other timer mode
 * ignores the setting entirely.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores, relaunch, flushQueue, expoMock } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';
import { loadAnalytics, loadViewModel, setNowFn } from './helpers/analytics.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DUR = 60_000;

function isResumable(status: string): boolean {
  return status === 'running' || status === 'paused';
}

function enableRepeat(app: LoadedApp): void {
  app.useSettingsStore.getState().updateSettings({ timerCompletionBehavior: 'repeat' });
}

describe('P9 Countdown Repeat', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
    setNowFn();
  });

  it('1. default behavior is stop', () => {
    const state = app.useSettingsStore.getState();
    assert.equal(state.settings.timerCompletionBehavior, 'stop');
  });

  it('2. repeat can be enabled and persists across relaunch', async () => {
    enableRepeat(app);
    const app2 = await relaunch();
    assert.equal(app2.useSettingsStore.getState().settings.timerCompletionBehavior, 'repeat');
  });

  it('3. continue behaves as stop', () => {
    app.useSettingsStore.getState().updateSettings({ timerCompletionBehavior: 'continue' });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.sessions.length, 1);
  });

  it('4. stop: completion ends in completed with no restart', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.sessions.length, 1);
  });

  it('5. stop: repeated completeTimer calls add nothing (exactly-once)', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    api.completeTimer();
    api.completeTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.sessions.length, 1);
    assert.equal(state.timer.status, 'completed');
  });

  it('6. repeat activates: completion restarts a running cycle', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.ok(typeof state.timer.targetTimestamp === 'number');
  });

  it('7. first completion records exactly one entry', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].mode, 'countdown');
    assert.equal(state.sessions[0].phase, 'single');
    assert.equal(state.sessions[0].plannedDurationMs, DUR);
    assert.equal(state.sessions[0].actualDurationMs, DUR);
  });

  it('8. repeated cycle has fresh target, zeroed elapsed, and a new phase clock', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    // Completed at T0 + 61s; the new cycle runs a full duration from there.
    assert.equal(state.timer.targetTimestamp, T0 + 61_000 + DUR);
    assert.equal(state.timer.elapsedTimeMs, 0);
    assert.equal(state.timer.phaseStartedAtMs, T0 + 61_000);
    assert.equal(state.timer.pausedAt, null);
  });

  it('9. second completion adds exactly one more entry (total 2)', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    assert.equal(app.useTimerStore.getState().sessions.length, 2);
  });

  it('10. multiple repeats accumulate correctly (5 cycles → 5 sessions)', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    for (let i = 0; i < 5; i += 1) {
      clock.advance(DUR + 1_000);
      api.completeTimer();
    }
    const state = app.useTimerStore.getState();
    assert.equal(state.sessions.length, 5);
    assert.equal(state.timer.status, 'running');
  });

  it('11. repeated duration stays correct across cycles', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.durationMs, DUR);
    assert.equal(state.timer.mode, 'countdown');
    // Third cycle runs a full duration from the second completion.
    assert.equal(state.timer.targetTimestamp, T0 + 122_000 + DUR);
  });

  it('12. repeated sessions have distinct ids and timestamps (no duplicates)', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0].id, sessions[1].id);
    assert.ok(sessions[1].completedAtMs > sessions[0].completedAtMs);
  });

  it('13. 1-second countdown repeats', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 1_000);
    api.startTimer();
    clock.advance(1_500);
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.sessions.length, 1);
    assert.equal(state.timer.targetTimestamp, T0 + 1_500 + 1_000);
  });

  it('14. zero-duration countdown never repeats (stops, no runaway)', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 0);
    api.startTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.timer.targetTimestamp, null);
    api.completeTimer();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('15. pause during a repeated cycle freezes it', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer(); // repeat restart at T0 + 61s
    clock.advance(10_000);
    api.pauseTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.elapsedTimeMs, 10_000);
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.sessions.length, 1);
  });

  it('16. resume during a repeated cycle re-anchors it', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer(); // repeat restart at T0 + 61s
    clock.advance(10_000);
    api.pauseTimer();
    clock.advance(5_000);
    api.resumeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.timer.targetTimestamp, T0 + 76_000 + 50_000);
  });

  it('17. reset during a repeated cycle stops it without a new record', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    api.resetTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 1);
  });

  it('18. leaving and returning preserves the repeated cycle', async () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const target = app.useTimerStore.getState().timer.targetTimestamp;
    // Leaving ActiveTimer performs no store mutation; relaunch rehydrates
    // the same persisted bytes with no extra completion.
    const app2 = await relaunch();
    const state = app2.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.timer.targetTimestamp, target);
    assert.equal(state.sessions.length, 1);
  });

  it('19. restoration of an expired repeated cycle completes once and restarts', async () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    const app2 = await relaunch();
    app2.restoreTimerState();
    const state = app2.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.sessions.length, 1);
    assert.ok(
      typeof state.timer.targetTimestamp === 'number' &&
        (state.timer.targetTimestamp as number) - Date.now() > 0,
    );
  });

  it('20. restoration of a future-target repeated cycle is untouched', async () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    const target = app.useTimerStore.getState().timer.targetTimestamp;
    const app2 = await relaunch();
    app2.restoreTimerState();
    const state = app2.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.timer.targetTimestamp, target);
    assert.equal(state.sessions.length, 0);
  });

  it('21. replacement guard sees a repeated cycle as active', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const activeTimer = app.useTimerStore.getState().timer;
    assert.ok(isResumable(activeTimer.status));
  });

  it('22. switching modes replaces a repeated timer but preserves history', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.mode, 'pomodoro');
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 1);
  });

  it('23. label propagates to every repeated cycle', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR, undefined, undefined, 'Repeat Me');
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].label, 'Repeat Me');
    assert.equal(sessions[1].label, 'Repeat Me');
  });

  it('24. analytics: two repeats count focused time and sessions', async () => {
    await loadAnalytics();
    const viewModel = await loadViewModel();
    setNowFn(() => Date.now());
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    const vm = viewModel.buildAnalyticsViewModel(sessions, Date.now(), 120_000);
    assert.equal(vm.today.focusedMs, 120_000);
    assert.equal(vm.today.sessionCount, 2);
  });

  it('25. daily goal reflects repeated cycles', async () => {
    await loadAnalytics();
    const viewModel = await loadViewModel();
    setNowFn(() => Date.now());
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    const vm = viewModel.buildAnalyticsViewModel(sessions, Date.now(), 120_000);
    assert.equal(vm.dailyGoal.focusedMs, 120_000);
    assert.equal(vm.dailyGoal.progress, 1);
    assert.equal(vm.dailyGoal.isCompleted, true);
  });

  it('26. weekly and monthly summaries reflect repeats', async () => {
    await loadAnalytics();
    const viewModel = await loadViewModel();
    setNowFn(() => Date.now());
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    const vm = viewModel.buildAnalyticsViewModel(sessions, Date.now());
    assert.equal(vm.week.focusedMs, 120_000);
    assert.equal(vm.week.sessionCount, 2);
    assert.equal(vm.month.focusedMs, 120_000);
    assert.equal(vm.month.sessionCount, 2);
  });

  it('27. repeat replaces the notification schedule (exactly one)', async () => {
    const cleanup = app.notifications.initializeNotifications();
    try {
      await flushQueue();
      const api = app.useTimerStore.getState();
      enableRepeat(app);
      api.initializeTimer('countdown', DUR);
      api.startTimer();
      await flushQueue();
      await flushQueue();
      assert.equal(expoMock().__scheduledCount(), 1);
      const firstId = expoMock().__log().schedules.slice(-1)[0].id;
      clock.advance(DUR + 1_000);
      api.completeTimer();
      await flushQueue();
      await flushQueue();
      assert.equal(expoMock().__scheduledCount(), 1);
      const latest = expoMock().__log().schedules.slice(-1)[0];
      assert.equal(latest.triggerDate, T0 + 61_000 + DUR);
      assert.ok(expoMock().__log().cancels.includes(firstId));
    } finally {
      cleanup();
    }
  });

  it('28. reset during a repeat cancels the schedule', async () => {
    const cleanup = app.notifications.initializeNotifications();
    try {
      await flushQueue();
      const api = app.useTimerStore.getState();
      enableRepeat(app);
      api.initializeTimer('countdown', DUR);
      api.startTimer();
      await flushQueue();
      await flushQueue();
      assert.equal(expoMock().__scheduledCount(), 1);
      clock.advance(DUR + 1_000);
      api.completeTimer();
      api.resetTimer();
      await flushQueue();
      assert.equal(expoMock().__scheduledCount(), 0);
    } finally {
      cleanup();
    }
  });

  it('29. pomodoro ignores the repeat setting', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].phase, 'focus');
  });

  it('30. interval ignores the repeat setting', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 4 });
    api.startTimer();
    api.nextRound();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.sessions.length, 1);
  });

  it('31. count-up ignores the repeat setting', () => {
    enableRepeat(app);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.sessions.length, 0);
  });
});
