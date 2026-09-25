/**
 * History exactly-once behavior (Issues #1-#11 invariants).
 *
 * Uses the REAL `completeTimer()` / `nextRound()` / `nextPomodoroPhase()`
 * paths — never a reimplementation. Focus-equivalent phases (countdown
 * single, pomodoro focus, interval work) record exactly one session each;
 * rests, breaks, pauses, resets, and count-ups record nothing, and neither
 * duplicate calls nor lifecycle restores can add a second record.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('history exactly-once', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('countdown completion records one session with true timestamps', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 65_000);
    api.startTimer();
    clock.advance(5_000);
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].mode, 'countdown');
    assert.equal(sessions[0].phase, 'single');
    assert.equal(sessions[0].plannedDurationMs, 65_000);
    assert.equal(sessions[0].actualDurationMs, 65_000);
    assert.equal(sessions[0].startedAtMs, T0);
    assert.equal(sessions[0].completedAtMs, T0 + 5_000);
  });

  it('pomodoro focus records once, break records nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', 25 * MIN, undefined, {
      focusMs: 25 * MIN,
      breakMs: 5 * MIN,
      longBreakMs: 15 * MIN,
      sessionsBeforeLongBreak: 4,
    });
    api.startTimer();
    api.nextPomodoroPhase();
    let sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].phase, 'focus');
    api.resumeTimer();
    api.nextPomodoroPhase();
    sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
  });

  it('interval work records once with round info, rest records nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds: 4 });
    api.startTimer();
    api.nextRound();
    let sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].phase, 'work');
    assert.equal(sessions[0].round, 0);
    assert.equal(sessions[0].totalRounds, 4);
    api.resumeTimer();
    api.nextRound();
    sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
  });

  it('count-up, pause, reset, and clear record nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(30_000);
    api.pauseTimer();
    api.resetTimer();
    api.clearTimer();
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('abandoning a paused run records nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(30_000);
    api.pauseTimer();
    api.resetTimer();
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('duplicate completion attempts still leave exactly one record', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    api.completeTimer();
    api.completeTimer();
    api.completeTimer();
    app.restoreTimerState();
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('recovery after a past-target completion cannot double-record', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(120_000);
    app.restoreTimerState();
    clock.advance(60_000);
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('actual duration always equals planned duration', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(45_000);
    api.pauseTimer();
    clock.advance(3_600_000);
    api.resumeTimer();
    api.completeTimer();
    const sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 1);
    // Pauses only shift wall-clock time; the delivered focus is the plan.
    assert.equal(sessions[0].actualDurationMs, sessions[0].plannedDurationMs);
  });

  it('history is bounded, newest retained', () => {
    const api = app.useTimerStore.getState();
    for (let i = 0; i < 505; i += 1) {
      clock.setNow(T0 + i * 1_000);
      api.initializeTimer('countdown', 60_000);
      api.startTimer();
      api.completeTimer();
    }
    const sessions = app.useTimerStore.getState().sessions;
    assert.equal(sessions.length, 500);
    // Oldest retained is iteration 5; newest last.
    assert.equal(sessions[0].completedAtMs, T0 + 5 * 1_000);
    assert.equal(sessions[499].completedAtMs, T0 + 504 * 1_000);
  });
});
