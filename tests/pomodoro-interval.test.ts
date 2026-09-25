/**
 * Pomodoro and Interval phase machines (Issues #1-#11 invariants).
 *
 * Pomodoro: pure Focus <-> Break alternation, every next phase staged
 * stopped for a manual Start — never an automatic loop.
 * Interval: Work/Rest progression with manual staging by default and
 * auto-start when the persisted setting is on; the final Rest completes
 * without creating an extra Work phase; only Work phases record history.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function startPomodoro(app: LoadedApp): void {
  app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
    focusMs: 25 * MIN,
    breakMs: 5 * MIN,
    longBreakMs: 15 * MIN,
    sessionsBeforeLongBreak: 4,
  });
  app.useTimerStore.getState().startTimer();
}

function startInterval(app: LoadedApp, rounds = 3): void {
  app.useTimerStore
    .getState()
    .initializeTimer('interval', 30_000, { workMs: 30_000, restMs: 10_000, rounds });
}

describe('pomodoro phases', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('finishing focus stages a stopped break and records one focus session', () => {
    startPomodoro(app);
    app.useTimerStore.getState().nextPomodoroPhase();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.durationMs, 5 * MIN);
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.timer.elapsedTimeMs, 0);
    assert.equal(state.timer.phaseStartedAtMs, null);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].mode, 'pomodoro');
    assert.equal(state.sessions[0].phase, 'focus');
    assert.equal(state.sessions[0].plannedDurationMs, 25 * MIN);
    assert.equal(state.sessions[0].actualDurationMs, 25 * MIN);
  });

  it('finishing a break stages a stopped focus and records nothing', () => {
    startPomodoro(app);
    const api = app.useTimerStore.getState();
    api.nextPomodoroPhase();
    api.resumeTimer();
    api.nextPomodoroPhase();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, true);
    assert.equal(state.timer.durationMs, 25 * MIN);
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.sessions.length, 1);
  });

  it('phases never auto-start: transitions always land stopped', () => {
    startPomodoro(app);
    const api = app.useTimerStore.getState();
    for (let i = 0; i < 6; i += 1) {
      // A staged phase has no phase clock until the user starts it; only a
      // started phase can finish, so resume first (no-op while running).
      api.resumeTimer();
      clock.advance(MIN);
      api.nextPomodoroPhase();
      assert.equal(app.useTimerStore.getState().timer.status, 'paused');
    }
    // Three finished focus phases recorded; three finished breaks silent.
    assert.equal(app.useTimerStore.getState().sessions.length, 3);
  });

  it('a staged break started by the user anchors its own phase clock', () => {
    startPomodoro(app);
    const api = app.useTimerStore.getState();
    api.nextPomodoroPhase();
    clock.advance(9_000);
    api.resumeTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.phaseStartedAtMs, T0 + 9_000);
    assert.equal(timer.targetTimestamp, T0 + 9_000 + 5 * MIN);
  });

  it('reset mid-break returns to full focus without adding a record', () => {
    startPomodoro(app);
    const api = app.useTimerStore.getState();
    api.nextPomodoroPhase();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
    api.resetTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, true);
    assert.equal(state.timer.durationMs, 25 * MIN);
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 1);
  });
});

describe('interval rounds', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('manual mode stages rest stopped after work and records the work', () => {
    startInterval(app);
    const api = app.useTimerStore.getState();
    api.startTimer();
    api.nextRound();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.currentRound, 0);
    assert.equal(state.timer.durationMs, 10_000);
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.timer.targetTimestamp, null);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].mode, 'interval');
    assert.equal(state.sessions[0].phase, 'work');
    assert.equal(state.sessions[0].round, 0);
    assert.equal(state.sessions[0].totalRounds, 3);
  });

  it('manual mode advances rest into the next work round with no rest record', () => {
    startInterval(app);
    const api = app.useTimerStore.getState();
    api.startTimer();
    api.nextRound();
    api.resumeTimer();
    api.nextRound();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, true);
    assert.equal(state.timer.currentRound, 1);
    assert.equal(state.timer.durationMs, 30_000);
    assert.equal(state.timer.status, 'paused');
    assert.equal(state.sessions.length, 1);
  });

  it('final rest completes without an extra work phase or record', () => {
    startInterval(app, 2);
    const api = app.useTimerStore.getState();
    api.startTimer();
    api.nextRound(); // work 1 -> rest 1 (staged)
    api.resumeTimer();
    api.nextRound(); // rest 1 -> work 2 (staged)
    api.resumeTimer();
    api.nextRound(); // work 2 -> rest 2 (staged)
    api.resumeTimer();
    api.nextRound(); // rest 2 of 2 -> completed
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.currentRound, 1);
    // Two work phases recorded; two rests silent; no third work exists.
    assert.equal(state.sessions.length, 2);
  });

  it('auto-start runs the next phase immediately with a fresh target', () => {
    startInterval(app);
    app.useSettingsStore.getState().updateSettings({ autoStartNextInterval: true });
    const api = app.useTimerStore.getState();
    api.startTimer();
    clock.advance(1_000);
    api.nextRound();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'running');
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.timer.targetTimestamp, T0 + 1_000 + 10_000);
    assert.equal(state.timer.phaseStartedAtMs, T0 + 1_000);
    assert.equal(state.sessions.length, 1);
  });

  it('auto-start final rest still terminates the run', () => {
    startInterval(app, 1);
    app.useSettingsStore.getState().updateSettings({ autoStartNextInterval: true });
    const api = app.useTimerStore.getState();
    api.startTimer();
    api.nextRound(); // work -> auto rest (running)
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
    api.nextRound(); // rest of single round -> completed
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
  });

  it('the auto-start setting is read live at each transition', () => {
    startInterval(app);
    const api = app.useTimerStore.getState();
    const settings = app.useSettingsStore.getState();
    api.startTimer();
    api.nextRound(); // default off -> staged
    assert.equal(app.useTimerStore.getState().timer.status, 'paused');
    settings.updateSettings({ autoStartNextInterval: true });
    const resumed = app.useTimerStore.getState();
    resumed.resumeTimer();
    resumed.nextRound(); // rest -> work, now auto-started
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
  });

  it('interval target math matches the phase duration', () => {
    startInterval(app);
    const api = app.useTimerStore.getState();
    api.startTimer();
    assert.equal(app.useTimerStore.getState().timer.targetTimestamp, T0 + 30_000);
  });
});
