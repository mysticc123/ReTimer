/**
 * Lifecycle logic (Issue #11 invariants) and the explicit test boundary.
 *
 * Models background gaps as clock jumps and restarts as `relaunch()` +
 * `restoreTimerState()` against surviving storage bytes. This proves the
 * deterministic core: timestamp math, exactly-once transitions, and state
 * preservation across restarts.
 *
 * WHAT THESE TESTS DO NOT PROVE (device/manual territory):
 * - real Android process death (no unit test kills a process),
 * - AlarmManager delivery, tray presentation, or notification taps,
 * - lock-screen, doze, or OEM-specific background restrictions,
 * - Metro-less release behavior or store-to-UI wiring.
 * Those remain covered by the ADB lifecycle helper
 * (`scripts/adb-lifecycle.ps1`) and the Issue #11 device matrix.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores, relaunch } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('lifecycle logic', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('a background gap only consumes wall-clock time, then foreground resumes', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    // Background for 20s: no actions run, the target is untouched.
    clock.advance(20_000);
    // Foreground: the display recomputes from the same target.
    assert.equal(app.useTimerStore.getState().getRemainingTime(), 40_000);
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
  });

  it('a timer that expires during the gap completes on next launch, once', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(75_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'completed');
    assert.equal(api.sessions.length, 1);
  });

  it('three consecutive launches after expiry still record once', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(61_000);
    for (let i = 0; i < 3; i += 1) {
      app = await relaunch();
      app.restoreTimerState();
      clock.advance(10_000);
    }
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('a paused timer survives relaunch frozen, then resumes correctly', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(12_000);
    api.pauseTimer();
    clock.advance(600_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'paused');
    assert.equal(api.getRemainingTime(), 48_000);
    api.resumeTimer();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'running');
    assert.equal(api.timer.targetTimestamp, T0 + 612_000 + 48_000);
  });

  it('abandoning a dead running timer via reset records nothing', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(10_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'running');
    api.resetTimer();
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('pomodoro focus expiring across relaunch stages rest with one record', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    clock.advance(25 * MIN + 30_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'paused');
    assert.equal(api.timer.isWorkPhase, false);
    assert.equal(api.sessions.length, 1);
    assert.equal(api.sessions[0].phase, 'focus');
  });

  it('interval work expiring across relaunch stages rest with one record', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 4 });
    api.startTimer();
    clock.advance(45_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'paused');
    assert.equal(api.timer.isWorkPhase, false);
    assert.equal(api.sessions.length, 1);
    assert.equal(api.sessions[0].phase, 'work');
  });

  it('documents the unit-test boundary honestly', () => {
    // This suite controls Date.now, storage bytes, and scheduled alarms
    // in memory. It cannot kill a process, deliver an OS notification, or
    // lock a screen — those stay on the device matrix by design.
    assert.equal(typeof Date.now(), 'number');
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });
});
