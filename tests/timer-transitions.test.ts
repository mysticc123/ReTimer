/**
 * Core timer state transitions (Issues #1-#11 invariants).
 *
 * Exercises the REAL Zustand actions with a pinned clock. No sleeps.
 * Each test loads a pristine app instance (fresh modules, empty storage).
 *
 * Layering note: `initializeTimer('countdown', 0)` is accepted here on
 * purpose — the `00:00 is invalid` rule is enforced by the LandingScreen
 * duration editor (UI layer), not the store. The store stays permissive.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('timer state transitions', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('initializes a countdown as idle with a clean phase clock', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.mode, 'countdown');
    assert.equal(timer.durationMs, 60_000);
    assert.equal(timer.status, 'idle');
    assert.equal(timer.targetTimestamp, null);
    assert.equal(timer.pausedAt, null);
    assert.equal(timer.elapsedTimeMs, 0);
    assert.equal(timer.phaseStartedAtMs, null);
  });

  it('initializes interval rounds and pomodoro config snapshots', () => {
    app.useTimerStore
      .getState()
      .initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 8 });
    const interval = app.useTimerStore.getState().timer;
    assert.equal(interval.totalRounds, 8);
    assert.equal(interval.currentRound, 0);
    assert.equal(interval.isWorkPhase, true);

    app.useTimerStore
      .getState()
      .initializeTimer('pomodoro', 25 * MIN, undefined, { focusMs: 25 * MIN, breakMs: 5 * MIN, longBreakMs: 15 * MIN, sessionsBeforeLongBreak: 4 });
    const pomo = app.useTimerStore.getState().timer;
    assert.equal(pomo.pomodoroConfig?.focusMs, 25 * MIN);
    assert.equal(pomo.pomodoroConfig?.breakMs, 5 * MIN);
    assert.equal(pomo.pomodoroConfig?.longBreakMs, 15 * MIN);
    assert.equal(pomo.pomodoroConfig?.sessionsBeforeLongBreak, 4);
    assert.equal(pomo.durationMs, 25 * MIN);
  });

  it('accepts a zero duration at the store layer (UI rejects 00:00, not the store)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 0);
    assert.equal(app.useTimerStore.getState().timer.durationMs, 0);
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');
  });

  it('start moves idle to running with a future target and fresh phase clock', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.targetTimestamp, T0 + 60_000);
    assert.equal(timer.phaseStartedAtMs, T0);
    assert.equal(timer.pausedAt, null);
  });

  it('start from paused resumes without moving the phase clock', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(10_000);
    api.pauseTimer();
    const pausedAt = app.useTimerStore.getState().timer.pausedAt;
    assert.equal(pausedAt, T0 + 10_000);
    clock.advance(5_000);
    api.startTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    // 50s of work remained when paused; 5s of wall-clock passed while paused.
    assert.equal(timer.targetTimestamp, T0 + 15_000 + 50_000);
    assert.equal(timer.phaseStartedAtMs, T0);
    assert.equal(timer.pausedAt, null);
  });

  it('start is a no-op when already running or completed', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    const target = app.useTimerStore.getState().timer.targetTimestamp;
    clock.advance(1_000);
    api.startTimer();
    assert.equal(app.useTimerStore.getState().timer.targetTimestamp, target);
    api.completeTimer();
    api.startTimer();
    assert.equal(app.useTimerStore.getState().timer.status, 'completed');
  });

  it('pause freezes elapsed time and keeps the phase clock', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(12_000);
    api.pauseTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'paused');
    assert.equal(timer.elapsedTimeMs, 12_000);
    assert.equal(timer.targetTimestamp, null);
    assert.equal(timer.pausedAt, T0 + 12_000);
    assert.equal(timer.phaseStartedAtMs, T0);
  });

  it('pause is a no-op unless running', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.pauseTimer();
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');
  });

  it('resume continues from the frozen elapsed anchor', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(12_000);
    api.pauseTimer();
    clock.advance(30_000);
    api.resumeTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.targetTimestamp, T0 + 42_000 + (60_000 - 12_000));
    assert.equal(timer.phaseStartedAtMs, T0);
  });

  it('resume on a staged manual phase anchors the phase clock at resume time', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    api.nextPomodoroPhase();
    let timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'paused');
    assert.equal(timer.phaseStartedAtMs, null);
    clock.advance(7_000);
    api.resumeTimer();
    timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.phaseStartedAtMs, T0 + 7_000);
    assert.equal(timer.targetTimestamp, T0 + 7_000 + 5 * MIN);
  });

  it('resume is a no-op unless paused', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.resumeTimer();
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');
  });

  it('reset clears active state and records nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(20_000);
    api.resetTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.timer.elapsedTimeMs, 0);
    assert.equal(state.timer.phaseStartedAtMs, null);
    assert.equal(state.sessions.length, 0);
  });

  it('resetting a pomodoro mid-break restarts at full focus', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    api.nextPomodoroPhase();
    api.resetTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.isWorkPhase, true);
    assert.equal(timer.durationMs, 25 * MIN);
    assert.equal(timer.status, 'idle');
  });

  it('clearTimer returns to the built-in initial state', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    api.clearTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'idle');
    assert.equal(timer.mode, 'pomodoro');
    assert.equal(timer.phaseStartedAtMs, null);
  });

  it('completeTimer only fires from running and is exactly-once', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.completeTimer();
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');
    api.startTimer();
    api.completeTimer();
    api.completeTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.timer.elapsedTimeMs, 60_000);
    assert.equal(state.sessions.length, 1);
  });

  it('getRemainingTime reflects idle, running, and paused states', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    assert.equal(api.getRemainingTime(), 60_000);
    api.startTimer();
    clock.advance(15_000);
    assert.equal(app.useTimerStore.getState().getRemainingTime(), 45_000);
    api.pauseTimer();
    assert.equal(app.useTimerStore.getState().getRemainingTime(), 45_000);
    clock.advance(60_000);
    assert.equal(app.useTimerStore.getState().getRemainingTime(), 45_000);
  });
});
