/**
 * Persistence and relaunch recovery (Issue #11 invariants).
 *
 * Verifies the persisted snapshot contains everything needed to rebuild a
 * live timer (status, target, phase clock, elapsed, sessions) and that a
 * simulated relaunch — fresh modules rehydrated from the surviving mock
 * MMKV bytes — reconstructs each state correctly without duplicating
 * history. Corrupt storage falls back to defaults instead of crashing.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores, relaunch, mmkvMock } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const TIMER_KEY = 'retimer-timer-state';

interface PersistedSnapshot {
  state?: {
    timer?: Record<string, unknown>;
    sessions?: unknown[];
  };
}

function readSnapshot(): PersistedSnapshot {
  const raw = mmkvMock().__readRaw(TIMER_KEY);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'expected persisted bytes');
  return JSON.parse(raw as string) as PersistedSnapshot;
}

describe('persistence and relaunch', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('running state persists target, phase clock, and elapsed together', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(9_000);
    api.updateElapsedTime(9_000);
    const timer = readSnapshot().state?.timer;
    assert.equal(timer?.['status'], 'running');
    assert.equal(timer?.['targetTimestamp'], T0 + 60_000);
    assert.equal(timer?.['phaseStartedAtMs'], T0);
    assert.equal(timer?.['elapsedTimeMs'], 9_000);
  });

  it('paused state persists frozen elapsed, pause mark, and phase clock', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(9_000);
    api.pauseTimer();
    const timer = readSnapshot().state?.timer;
    assert.equal(timer?.['status'], 'paused');
    assert.equal(timer?.['elapsedTimeMs'], 9_000);
    assert.equal(timer?.['pausedAt'], T0 + 9_000);
    assert.equal(timer?.['targetTimestamp'], null);
    assert.equal(timer?.['phaseStartedAtMs'], T0);
  });

  it('completion callbacks never reach storage', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    app.useTimerStore.setState((state) => ({
      timer: { ...state.timer, onComplete: () => undefined },
    }));
    api.updateElapsedTime(1_000);
    const raw = mmkvMock().__readRaw(TIMER_KEY) ?? '';
    assert.ok(!raw.includes('onComplete'), 'callback leaked into JSON storage');
  });

  it('relaunch rebuilds a future-target running timer verbatim', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(20_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'running');
    assert.equal(api.timer.targetTimestamp, T0 + 60_000);
    assert.equal(api.timer.phaseStartedAtMs, T0);
    assert.equal(api.getRemainingTime(), 40_000);
  });

  it('relaunch completes a past-target countdown exactly once across reboots', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(61_000);
    app = await relaunch();
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().timer.status, 'completed');
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
    app = await relaunch();
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('relaunch keeps a paused timer frozen with its phase clock', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    api.startTimer();
    clock.advance(12_000);
    api.pauseTimer();
    clock.advance(3_600_000);
    app = await relaunch();
    app.restoreTimerState();
    api = app.useTimerStore.getState();
    assert.equal(api.timer.status, 'paused');
    assert.equal(api.timer.elapsedTimeMs, 12_000);
    assert.equal(api.timer.phaseStartedAtMs, T0);
    assert.equal(api.getRemainingTime(), 48_000);
  });

  it('relaunch never resurrects idle or completed timers', async () => {
    let api = app.useTimerStore.getState();
    api.initializeTimer('countdown', 60_000);
    app = await relaunch();
    app.restoreTimerState();
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');

    api = app.useTimerStore.getState();
    api.startTimer();
    api.completeTimer();
    app = await relaunch();
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
  });

  it('relaunch retains settings such as auto-start', async () => {
    app.useSettingsStore.getState().updateSettings({ autoStartNextInterval: true });
    app = await relaunch();
    assert.equal(
      app.useSettingsStore.getState().settings.autoStartNextInterval,
      true,
    );
  });

  it('corrupt persisted bytes fall back to defaults without throwing', async () => {
    mmkvMock().createMMKV().set(TIMER_KEY, 'not-json{{{');
    app = await relaunch();
    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'idle');
    assert.equal(state.sessions.length, 0);
  });
});
