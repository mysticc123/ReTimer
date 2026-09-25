/**
 * Timestamp math and lifecycle restoration (Issue #11 invariants).
 *
 * Covers `restoreTimerState()` branches with a pinned clock:
 * future target (keep running), past target (mode transition), count-up
 * bypass, corrupt fallback, and untouched idle/paused/completed states.
 * No sleeps; time travel is explicit.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('timestamp math and restoreTimerState', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('running countdown before target is left running untouched', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(20_000);
    app.restoreTimerState();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.targetTimestamp, T0 + 60_000);
    assert.equal(timer.phaseStartedAtMs, T0);
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('countdown exactly at target takes the past-target branch and completes once', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(60_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].mode, 'countdown');
  });

  it('countdown past target completes with the original phase start', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(90_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].startedAtMs, T0);
    assert.equal(state.sessions[0].plannedDurationMs, 60_000);
  });

  it('pomodoro past target advances the phase instead of completing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    clock.advance(25 * MIN + 1_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    // Manual phases stage stopped: the finished focus becomes pending rest.
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.durationMs, 5 * MIN);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].phase, 'focus');
  });

  it('pomodoro future target stays running without recording', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    clock.advance(MIN);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.sessions.length, 0);
  });

  it('interval past target advances the round with work-only history', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 3 });
    api.startTimer();
    clock.advance(31_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    // Manual mode stages the rest phase stopped.
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].phase, 'work');
  });

  it('count-up is bypassed by restore no matter how old the anchor is', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(3_600_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.sessions.length, 0);
  });

  it('running without a target falls back to idle instead of sticking', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    // Simulate a corrupt/legacy snapshot: running but no target.
    app.useTimerStore.setState((state) => ({
      timer: { ...state.timer, targetTimestamp: null },
    }));
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 0);
  });

  it('past-target interval without config falls back to idle with no record', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 3 });
    api.startTimer();
    // Legacy snapshot that lost its phase config: the transition declines,
    // and restore must not leave the timer expired-but-running forever.
    app.useTimerStore.setState((state) => ({
      timer: { ...state.timer, intervalConfig: undefined },
    }));
    clock.advance(31_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 0);
  });

  it('past-target pomodoro without config falls back to idle with no record', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    app.useTimerStore.setState((state) => ({
      timer: { ...state.timer, pomodoroConfig: undefined },
    }));
    clock.advance(25 * MIN + 1_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 0);
  });

  it('idle, paused, and completed states are untouched by restore', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');

    api.startTimer();
    api.pauseTimer();
    clock.advance(5 * MIN);
    app.restoreTimerState();
    let timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'paused');
    assert.equal(timer.elapsedTimeMs, 0);
    assert.equal(timer.pausedAt, T0);

    api.resumeTimer();
    api.completeTimer();
    clock.advance(5 * MIN);
    app.restoreTimerState();
    timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'completed');
  });

  it('paused elapsed time survives arbitrarily long clock jumps', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(12_000);
    api.pauseTimer();
    clock.advance(24 * 3_600_000);
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.elapsedTimeMs, 12_000);
    assert.equal(state.sessions.length, 0);
  });

  it('repeated restores after a past-target completion record exactly once', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(61_000);
    app.restoreTimerState();
    app.restoreTimerState();
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });
});
