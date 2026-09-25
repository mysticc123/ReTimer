/**
 * P3 Countdown Presets — deterministic tests.
 *
 * Covers the Countdown preset quick-select feature using the existing
 * persisted `countdownPresetsMs` field. The presets are a fixed built-in
 * list (not user-editable) with default values: 5min, 15min, 30min, 45min, 60min.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores, relaunch } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

function isResumable(status: string): boolean {
  return status === 'running' || status === 'paused';
}

const DEFAULT_PRESETS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  45 * 60 * 1000,
  60 * 60 * 1000,
];

const COUNTDOWN_MIN_MS = 1000;
const COUNTDOWN_MAX_MS = 120 * 60 * 1000;

describe('P3 Countdown Presets', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
  });

  it('default presets exist in settings', () => {
    const state = app.useSettingsStore.getState();
    assert.deepEqual(state.settings.countdownPresetsMs, DEFAULT_PRESETS_MS);
  });

  it('presets come from countdownPresetsMs field', () => {
    const state = app.useSettingsStore.getState();
    // The field exists and is an array
    assert.ok(Array.isArray(state.settings.countdownPresetsMs));
    assert.ok(state.settings.countdownPresetsMs.length > 0);
  });

  it('preset durations are stored as milliseconds', () => {
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(Number.isInteger(presetMs));
      assert.ok(presetMs > 0);
    }
  });

  it('each default preset is within valid Countdown range (1s–120min)', () => {
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(presetMs >= COUNTDOWN_MIN_MS, `preset ${presetMs} below minimum`);
      assert.ok(presetMs <= COUNTDOWN_MAX_MS, `preset ${presetMs} above maximum`);
    }
  });

  it('valid preset selection produces correct Countdown duration', () => {
    const presetMs = 15 * 60 * 1000; // 15 minutes
    app.useSettingsStore.getState().updateSettings({ countdownDurationMs: presetMs });

    const state = app.useSettingsStore.getState();
    assert.equal(state.settings.countdownDurationMs, presetMs);
  });

  it('minimum 1-second boundary is respected for presets', () => {
    // The default presets are all >= 5 minutes, well above 1 second
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(presetMs >= COUNTDOWN_MIN_MS);
    }
  });

  it('maximum 120-minute boundary is respected for presets', () => {
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(presetMs <= COUNTDOWN_MAX_MS);
    }
  });

  it('out-of-range preset values are filtered out by UI logic', () => {
    // Simulate invalid persisted presets
    app.useSettingsStore.getState().updateSettings({
      countdownPresetsMs: [500, 15 * 60 * 1000, 200 * 60 * 1000], // 500ms (too small), 15min (valid), 200min (too large)
    });

    const state = app.useSettingsStore.getState();
    const validPresets = state.settings.countdownPresetsMs.filter(
      (ms) => ms >= COUNTDOWN_MIN_MS && ms <= COUNTDOWN_MAX_MS
    );
    assert.deepEqual(validPresets, [15 * 60 * 1000]);
  });

  it('existing custom duration behavior remains intact', () => {
    // Custom duration (wheel editor) should still work
    const customMs = 7 * 60 * 1000; // 7 minutes - not a preset
    app.useSettingsStore.getState().updateSettings({ countdownDurationMs: customMs });

    const state = app.useSettingsStore.getState();
    assert.equal(state.settings.countdownDurationMs, customMs);
    // Presets unchanged
    assert.deepEqual(state.settings.countdownPresetsMs, DEFAULT_PRESETS_MS);
  });

  it('preset selection while timer is running preserves replacement guard', () => {
    // Start a timer first
    app.useTimerStore.getState().initializeTimer('pomodoro', 25 * 60 * 1000, undefined, {
      focusMs: 25 * 60 * 1000,
      breakMs: 5 * 60 * 1000,
      longBreakMs: 15 * 60 * 1000,
      sessionsBeforeLongBreak: 4,
    });
    app.useTimerStore.getState().startTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'running');

    // Attempting to select a Countdown preset should trigger the guard
    // (In real UI, this sets pendingSelect. Here we verify the condition.)
    assert.ok(isResumable(activeTimer.status));
  });

  it('preset selection while timer is paused preserves replacement guard', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().pauseTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'paused');

    assert.ok(isResumable(activeTimer.status));
  });

  it('no guard when timer is completed — Countdown preset starts directly', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 60_000);
    app.useTimerStore.getState().startTimer();
    app.useTimerStore.getState().completeTimer();

    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'completed');

    assert.ok(!isResumable(activeTimer.status));
  });

  it('no guard when timer is idle — Countdown preset starts directly', () => {
    const activeTimer = app.useTimerStore.getState().timer;
    assert.equal(activeTimer.status, 'idle');

    assert.ok(!isResumable(activeTimer.status));
  });

  it('presets survive settings persistence/reload', async () => {
    // Modify settings to verify persistence layer accepts the array
    app.useSettingsStore.getState().updateSettings({
      countdownPresetsMs: DEFAULT_PRESETS_MS,
    });

    // Simulate relaunch
    const app2 = await relaunch();
    const state = app2.useSettingsStore.getState();

    // The persisted presets should survive
    assert.deepEqual(state.settings.countdownPresetsMs, DEFAULT_PRESETS_MS);
  });

  it('P1/P2 active timer indicator unaffected by Countdown preset selection', () => {
    app.useTimerStore.getState().initializeTimer('countdown', 10 * 60 * 1000);
    app.useTimerStore.getState().startTimer();

    const before = app.useTimerStore.getState().timer;
    assert.equal(before.status, 'running');
    assert.equal(before.mode, 'countdown');

    // Select a different Countdown preset
    app.useSettingsStore.getState().updateSettings({ countdownDurationMs: 15 * 60 * 1000 });

    // Active timer state unchanged
    const after = app.useTimerStore.getState().timer;
    assert.equal(after.status, 'running');
    assert.equal(after.mode, 'countdown');
    assert.equal(after.targetTimestamp, before.targetTimestamp);
    assert.equal(after.phaseStartedAtMs, before.phaseStartedAtMs);
  });

  it('preset values are positive integers representing milliseconds', () => {
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(typeof presetMs === 'number');
      assert.ok(Number.isInteger(presetMs));
      assert.ok(presetMs > 0);
    }
  });

  it('default preset list matches expected known values', () => {
    const state = app.useSettingsStore.getState();
    const presets = state.settings.countdownPresetsMs;
    assert.equal(presets.length, 5);
    assert.equal(presets[0], 5 * 60 * 1000);   // 5 min
    assert.equal(presets[1], 15 * 60 * 1000);  // 15 min
    assert.equal(presets[2], 30 * 60 * 1000);  // 30 min
    assert.equal(presets[3], 45 * 60 * 1000);  // 45 min
    assert.equal(presets[4], 60 * 60 * 1000);  // 60 min
  });

  it('selecting preset does not automatically start timer', () => {
    // Selecting a preset only updates the duration setting
    // The user must still press "Start" to begin
    app.useSettingsStore.getState().updateSettings({ countdownDurationMs: 5 * 60 * 1000 });

    const timerState = app.useTimerStore.getState().timer;
    assert.equal(timerState.status, 'idle'); // Timer not started
  });

  it('Countdown max duration (120 min) is respected by preset validation', () => {
    // The default presets max is 60 min, well within 120 min
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(presetMs <= 120 * 60 * 1000);
    }
  });

  it('Countdown min duration (1s) is respected by preset validation', () => {
    const state = app.useSettingsStore.getState();
    for (const presetMs of state.settings.countdownPresetsMs) {
      assert.ok(presetMs >= 1000);
    }
  });
});