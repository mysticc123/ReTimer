/**
 * Count-Up behavior (Issues #1-#11 invariants).
 *
 * The stopwatch anchors `targetTimestamp` in the past and derives elapsed
 * as `now - targetTimestamp` (see ActiveTimerScreen). The store guarantees:
 * pause freezes, resume re-anchors losslessly, restore never touches a
 * running Count-Up, and no path ever records Count-Up history.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;

describe('count-up stopwatch', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  function elapsedOf(): number {
    const timer = app.useTimerStore.getState().timer;
    assert.ok(timer.targetTimestamp !== null);
    return Date.now() - (timer.targetTimestamp as number);
  }

  it('starts anchored at now with zero elapsed', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.targetTimestamp, T0);
    assert.equal(timer.phaseStartedAtMs, T0);
    assert.equal(elapsedOf(), 0);
  });

  it('elapsed tracks wall-clock exactly across a controlled run', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(20_179);
    assert.equal(elapsedOf(), 20_179);
    clock.advance(10_165);
    assert.equal(elapsedOf(), 30_344);
  });

  it('pause freezes and resume re-anchors without losing time', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(20_000);
    api.pauseTimer();
    let timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'paused');
    assert.equal(timer.elapsedTimeMs, 20_000);
    assert.equal(timer.targetTimestamp, null);
    clock.advance(50_000);
    api.resumeTimer();
    timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(timer.targetTimestamp, T0 + 70_000 - 20_000);
    clock.advance(10_000);
    assert.equal(elapsedOf(), 30_000);
  });

  it('restore never touches a running count-up, however old the anchor', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(3_600_000);
    app.restoreTimerState();
    const timer = app.useTimerStore.getState().timer;
    assert.equal(timer.status, 'running');
    assert.equal(elapsedOf(), 3_600_000);
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('reset abandons the run with no history', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(45_000);
    api.resetTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 0);
  });

  it('the normal path never completes: completion is unreachable without forcing it', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    clock.advance(3_600_000);
    // No transition in the store moves a count-up to completed on its own;
    // restore explicitly bypasses it (asserted above).
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
  });

  it('a forced completeTimer on count-up still records nothing', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', 0);
    api.startTimer();
    api.completeTimer();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 0);
  });
});
