/**
 * Notification synchronization (Issues #9/#11 invariants).
 *
 * Drives the REAL `src/services/notifications.ts` against a controllable
 * `expo-notifications` mock (in-memory schedule map, no AlarmManager).
 * Asserts the deterministic guarantees: one running phase gets exactly one
 * scheduled completion, state changes replace (never duplicate) it, and
 * paused/reset/completed/count-up states leave nothing scheduled — while
 * the service itself never writes timer state or history.
 *
 * Physical delivery, tray interaction, and exact-alarm behavior stay
 * device-tested; see lifecycle.test.ts for the explicit boundary.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores, relaunch, flushQueue, expoMock, rnMock } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
// Mirrors the module-private DATA_TAG in src/services/notifications.ts;
// the sweep/dismiss contract depends on this exact marker.
const DATA_TAG = 'retimer-phase-complete';

describe('notification synchronization', () => {
  let app: LoadedApp;
  let cleanup: () => void;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
    cleanup = app.notifications.initializeNotifications();
    await flushQueue();
  });

  afterEach(() => {
    cleanup();
    clock.restore();
  });

  function latestSchedule() {
    const schedules = expoMock().__log().schedules;
    assert.ok(schedules.length > 0, 'expected at least one schedule');
    return schedules[schedules.length - 1];
  }

  it('initializes channel and handler once with nothing scheduled while idle', () => {
    const log = expoMock().__log();
    assert.equal(log.handlerSet, 1);
    assert.equal(log.channelSets.length, 1);
    assert.equal(expoMock().__scheduledCount(), 0);
  });

  it('a running countdown gets exactly one scheduled completion', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);
    const schedule = latestSchedule();
    assert.equal(schedule.contentTitle, 'Timer complete');
    assert.equal(schedule.contentBody, 'Countdown complete · 1m');
    assert.equal(schedule.triggerDate, T0 + 60_000);
    assert.equal(schedule.channelId, app.notifications.COMPLETION_CHANNEL_ID);
    assert.equal(
      schedule.triggerType,
      expoMock().SchedulableTriggerInputTypes.DATE,
    );
  });

  it('a target change replaces the schedule instead of duplicating it', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    const firstId = latestSchedule().id;
    clock.advance(10_000);
    api.pauseTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);
    clock.advance(5_000);
    api.resumeTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);
    assert.ok(expoMock().__log().cancels.includes(firstId));
    assert.equal(latestSchedule().triggerDate, T0 + 15_000 + 50_000);
  });

  it('paused, reset, completed, and count-up states leave nothing scheduled', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);

    api.pauseTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);

    api.resumeTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);

    api.resetTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);

    api.initializeTimer('countup', 0);
    api.startTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);

    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    api.completeTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);
  });

  it('rapid transitions converge on at most one schedule', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    api.pauseTimer();
    api.resumeTimer();
    api.pauseTimer();
    api.resumeTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
  });

  it('mode-specific bodies name the finished phase', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    await flushQueue();
    assert.equal(latestSchedule().contentBody, 'Focus session complete · 25m');

    api.nextPomodoroPhase();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);
    api.resumeTimer();
    await flushQueue();
    assert.equal(latestSchedule().contentBody, 'Break over · 5m');

    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 2 });
    api.startTimer();
    await flushQueue();
    assert.equal(latestSchedule().contentBody, 'Work interval complete · 30s');
  });

  it('the service never mutates timer state or history', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    const before = JSON.stringify({
      timer: app.useTimerStore.getState().timer,
      sessions: app.useTimerStore.getState().sessions,
    });
    clock.advance(10_000);
    await flushQueue();
    await flushQueue();
    const after = JSON.stringify({
      timer: app.useTimerStore.getState().timer,
      sessions: app.useTimerStore.getState().sessions,
    });
    assert.equal(after, before);
    api.pauseTimer();
    await flushQueue();
    const afterPause = JSON.stringify({
      timer: app.useTimerStore.getState().timer,
      sessions: app.useTimerStore.getState().sessions,
    });
    assert.ok(afterPause.includes('"status":"paused"'));
  });

  it('denied permission disables scheduling without affecting the timer', async () => {
    expoMock().__setGrant(false);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 0);
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
    const log = expoMock().__log();
    assert.equal(log.permissionRequests, 1);
    // The one-time prompt is not repeated on later transitions.
    api.pauseTimer();
    api.resumeTimer();
    await flushQueue();
    assert.equal(expoMock().__log().permissionRequests, 1);
    assert.equal(expoMock().__scheduledCount(), 0);
  });

  it('returning to foreground dismisses only our own presented notifications', async () => {
    expoMock().__present('ours-1', { retimer: DATA_TAG });
    expoMock().__present('foreign-1', { other: true });
    rnMock().__fireAppState('active');
    await flushQueue();
    assert.deepEqual(expoMock().__log().presentedDismissed, ['ours-1']);
    const remaining = await expoMock().getPresentedNotificationsAsync();
    assert.deepEqual(
      remaining.map((item) => item.request.identifier),
      ['foreign-1'],
    );
  });

  it('relaunch sweeps the orphan and reschedules exactly one completion', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    await flushQueue();
    assert.equal(expoMock().__scheduledCount(), 1);
    const orphanId = latestSchedule().id;

    clock.advance(10_000);
    app = await relaunch();
    cleanup = app.notifications.initializeNotifications();
    await flushQueue();

    assert.equal(expoMock().__scheduledCount(), 1);
    assert.ok(expoMock().__log().cancels.includes(orphanId));
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
    assert.equal(app.useTimerStore.getState().timer.targetTimestamp, T0 + 60_000);
  });
});
