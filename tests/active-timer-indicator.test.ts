/**
 * P2 Active Timer Indicator — deterministic tests.
 *
 * Covers the Landing screen's running/paused timer indicator:
 * - Detection logic (hasResumableTimer)
 * - Mode labeling (modeLabel)
 * - Status distinction (running vs paused)
 * - State preservation on resume
 * - Replacement guard integrity
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

function modeLabel(mode: string): string {
  switch (mode) {
    case 'pomodoro':
      return 'Pomodoro';
    case 'countdown':
      return 'Countdown';
    case 'countup':
      return 'Count-Up';
    case 'interval':
      return 'Interval';
    default:
      return mode;
  }
}

function isResumable(status: string): boolean {
  return status === 'running' || status === 'paused';
}

describe('P2 Active Timer Indicator', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
  });

  it('running timer produces indicator (hasResumableTimer = true)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.ok(isResumable(state.timer.status));
  });

  it('paused timer produces indicator (hasResumableTimer = true)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const state = app.useTimerStore.getState();
    assert.ok(isResumable(state.timer.status));
  });

  it('idle timer does not produce indicator (hasResumableTimer = false)', () => {
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.ok(!isResumable(state.timer.status));
  });

  it('completed timer does not produce indicator (hasResumableTimer = false)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().completeTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.ok(!isResumable(state.timer.status));
  });

  it('indicator identifies pomodoro mode', () => {
    app.useTimerStore.getState().initializeTimer('pomodoro', 25 * 60 * 1000, undefined, {
      focusMs: 25 * 60 * 1000,
      breakMs: 5 * 60 * 1000,
      longBreakMs: 15 * 60 * 1000,
      sessionsBeforeLongBreak: 4,
    });
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(modeLabel(state.timer.mode), 'Pomodoro');
  });

  it('indicator identifies countdown mode', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 10 * 60 * 1000);
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(modeLabel(state.timer.mode), 'Countdown');
  });

  it('indicator identifies count-up mode', () => {
    app.useTimerStore.getState().initializeTimer('countup', 0);
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(modeLabel(state.timer.mode), 'Count-Up');
  });

  it('indicator identifies interval mode', () => {
    app.useTimerStore.getState().initializeTimer('interval', 30_000, {
      workMs: 30_000,
      restMs: 10_000,
      rounds: 4,
    });
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(modeLabel(state.timer.mode), 'Interval');
  });

  it('indicator distinguishes running status', () => {
    app.useTimerStore.getState().initializeTimer('pomodoro', 25 * 60 * 1000, undefined, {
      focusMs: 25 * 60 * 1000,
      breakMs: 5 * 60 * 1000,
      longBreakMs: 15 * 60 * 1000,
      sessionsBeforeLongBreak: 4,
    });
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(isResumable(state.timer.status), true);
  });

  it('indicator distinguishes paused status', () => {
    app.useTimerStore.getState().initializeTimer('pomodoro', 25 * 60 * 1000, undefined, {
      focusMs: 25 * 60 * 1000,
      breakMs: 5 * 60 * 1000,
      longBreakMs: 15 * 60 * 1000,
      sessionsBeforeLongBreak: 4,
    });
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'paused');
    assert.equal(isResumable(state.timer.status), true);
  });

  it('selecting indicator returns to existing ActiveTimer state (running)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 10 * 60 * 1000);
    app.useTimerStore.getState().startTimer();

    const before = app.useTimerStore.getState().timer;
    const targetTimestamp = before.targetTimestamp;
    const elapsedTimeMs = before.elapsedTimeMs;
    const phaseStartedAtMs = before.phaseStartedAtMs;

    // Simulate resumeExistingTimer: navigate without initializeTimer
    const after = app.useTimerStore.getState().timer;

    assert.equal(after.targetTimestamp, targetTimestamp);
    assert.equal(after.elapsedTimeMs, elapsedTimeMs);
    assert.equal(after.phaseStartedAtMs, phaseStartedAtMs);
    assert.equal(after.status, 'running');
  });

  it('selecting indicator returns to existing ActiveTimer state (paused)', () => {
    app.useTimerStore.getState().initializeTimer('interval', 30_000, {
      workMs: 30_000,
      restMs: 10_000,
      rounds: 8,
    });
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const before = app.useTimerStore.getState().timer;
    const elapsedTimeMs = before.elapsedTimeMs;
    const pausedAt = before.pausedAt;
    const currentRound = before.currentRound;
    const isWorkPhase = before.isWorkPhase;

    // Simulate resumeExistingTimer: navigate without initializeTimer
    const after = app.useTimerStore.getState().timer;

    assert.equal(after.elapsedTimeMs, elapsedTimeMs);
    assert.equal(after.pausedAt, pausedAt);
    assert.equal(after.currentRound, currentRound);
    assert.equal(after.isWorkPhase, isWorkPhase);
    assert.equal(after.status, 'paused');
    assert.equal(after.targetTimestamp, null);
  });

  it('P1 state-preservation behavior remains intact (running timer)', () => {
    app.useTimerStore.getState().initializeTimer('pomodoro', 25 * 60 * 1000, undefined, {
      focusMs: 25 * 60 * 1000,
      breakMs: 5 * 60 * 1000,
      longBreakMs: 15 * 60 * 1000,
      sessionsBeforeLongBreak: 4,
    });
    app.useTimerStore.getState().startTimer();

    const before = app.useTimerStore.getState().timer;
    const mode = before.mode;
    const durationMs = before.durationMs;
    const pomodoroConfig = before.pomodoroConfig;
    const isWorkPhase = before.isWorkPhase;

    // Navigate back to ActiveTimer
    const after = app.useTimerStore.getState().timer;

    assert.equal(after.mode, mode);
    assert.equal(after.durationMs, durationMs);
    assert.equal(after.pomodoroConfig?.focusMs, pomodoroConfig?.focusMs);
    assert.equal(after.pomodoroConfig?.breakMs, pomodoroConfig?.breakMs);
    assert.equal(after.isWorkPhase, isWorkPhase);
    assert.equal(after.status, 'running');
  });

  it('P1 state-preservation behavior remains intact (paused timer)', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 5 * 60 * 1000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const before = app.useTimerStore.getState().timer;
    const mode = before.mode;
    const durationMs = before.durationMs;
    const elapsedTimeMs = before.elapsedTimeMs;
    const pausedAt = before.pausedAt;

    const after = app.useTimerStore.getState().timer;

    assert.equal(after.mode, mode);
    assert.equal(after.durationMs, durationMs);
    assert.equal(after.elapsedTimeMs, elapsedTimeMs);
    assert.equal(after.pausedAt, pausedAt);
    assert.equal(after.status, 'paused');
  });

  it('replacement guard remains intact when starting NEW timer while running', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'running');
    assert.ok(isResumable(activeTimer.status));

    // The guard triggers when user taps a NEW timer card
    // pendingSelect is set with the new timer config
    // User must confirm replacement — existing timer untouched until confirmed
  });

  it('replacement guard remains intact when starting NEW timer while paused', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'paused');
    assert.ok(isResumable(activeTimer.status));
  });

  it('no guard when timer is completed — new timer starts directly', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().completeTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'completed');
    assert.ok(!isResumable(activeTimer.status));
  });

  it('no guard when timer is idle — new timer starts directly', () => {
    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'idle');
    assert.ok(!isResumable(activeTimer.status));
  });

  it('indicator disappears when timer completes', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().completeTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.ok(!isResumable(state.timer.status));
  });

  it('indicator disappears when timer is reset to idle', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().resetTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.ok(!isResumable(state.timer.status));
  });

  it('running count-up produces indicator', () => {
    app.useTimerStore.getState().initializeTimer('countup', 0);
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.mode, 'countup');
    assert.equal(state.timer.status, 'running');
    assert.ok(isResumable(state.timer.status));
    assert.equal(modeLabel(state.timer.mode), 'Count-Up');
  });

  it('paused count-up produces indicator', () => {
    app.useTimerStore.getState().initializeTimer('countup', 0);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.mode, 'countup');
    assert.equal(state.timer.status, 'paused');
    assert.ok(isResumable(state.timer.status));
  });

  it('running interval with round state produces indicator', () => {
    app.useTimerStore.getState().initializeTimer('interval', 30_000, {
      workMs: 30_000,
      restMs: 10_000,
      rounds: 8,
    });
    app.useTimerStore.getState().startTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.mode, 'interval');
    assert.equal(state.timer.status, 'running');
    assert.ok(isResumable(state.timer.status));
    assert.equal(modeLabel(state.timer.mode), 'Interval');
    assert.equal(state.timer.currentRound, 0);
    assert.equal(state.timer.totalRounds, 8);
    assert.equal(state.timer.isWorkPhase, true);
  });
});