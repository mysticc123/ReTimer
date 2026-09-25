/**
 * Settings schema hygiene (Phase 3 / P4).
 *
 * Locks in the dead-field triage outcome:
 * - Removed fields (timerFontSize, animationIntensity, ambientAudio*,
 *   completionHapticIntensity) no longer exist in fresh defaults.
 * - Reserved fields (countdownPresetsMs, timerCompletionBehavior,
 *   soundEnabled, completionSound) remain with their documented defaults.
 * - Legacy persisted bytes containing the removed keys still load: active
 *   settings survive, the app keeps working, and reset restores defaults.
 *   (Zustand persist + the store initializer tolerate unknown keys; no
 *   migration is required and none was added.)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores, relaunch, mmkvMock } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const SETTINGS_KEY = 'retimer-settings';

const REMOVED_KEYS = [
  'timerFontSize',
  'animationIntensity',
  'ambientAudioEnabled',
  'ambientAudioTrack',
  'ambientAudioVolume',
  'completionHapticIntensity',
] as const;

function readSettings(app: LoadedApp): Record<string, unknown> {
  return app.useSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
}

describe('settings schema hygiene', () => {
  beforeEach(async () => {
    await loadStores();
  });

  it('fresh defaults contain active and reserved fields with expected values', async () => {
    const app = await loadStores();
    const settings = readSettings(app);
    // Active behavior fields.
    assert.equal(settings['theme'], 'dark');
    assert.equal(settings['fontScale'], 1.0);
    assert.equal(settings['hapticsEnabled'], true);
    assert.equal(settings['keepScreenAwake'], true);
    assert.equal(settings['fullscreenMode'], true);
    assert.equal(settings['reducedMotion'], false);
    assert.equal(settings['notificationsAsked'], false);
    assert.equal(settings['autoStartNextInterval'], false);
    // Reserved (dormant) fields retained for future Phase 3 features.
    assert.deepEqual(settings['countdownPresetsMs'], [
      5 * 60 * 1000,
      15 * 60 * 1000,
      30 * 60 * 1000,
      45 * 60 * 1000,
      60 * 60 * 1000,
    ]);
    assert.equal(settings['timerCompletionBehavior'], 'stop');
    assert.equal(settings['soundEnabled'], true);
    assert.equal(settings['completionSound'], 'gentle-chime');
  });

  it('fresh defaults do not contain removed dead fields', async () => {
    const app = await loadStores();
    const settings = readSettings(app);
    for (const key of REMOVED_KEYS) {
      assert.ok(!(key in settings), `expected fresh defaults without ${key}`);
    }
  });

  it('legacy persisted bytes with removed keys still load active settings', async () => {
    await loadStores();
    // Simulate an old install: current values plus stale dead keys.
    const legacy = {
      theme: 'light',
      accentColor: '#FF0000',
      fontFamily: 'roboto',
      timerFontSize: 2,
      animationIntensity: 'high',
      pomodoroFocusMs: 30 * 60 * 1000,
      ambientAudioEnabled: true,
      ambientAudioTrack: 'rain',
      ambientAudioVolume: 0.8,
      completionHapticIntensity: 'heavy',
      fontScale: 1.2,
    };
    mmkvMock()
      .createMMKV()
      .set(SETTINGS_KEY, JSON.stringify({ state: { settings: legacy }, version: 0 }));

    const app2 = await relaunch();
    const settings = readSettings(app2);
    // Active custom values survive the relaunch untouched.
    assert.equal(settings['theme'], 'light');
    assert.equal(settings['accentColor'], '#FF0000');
    assert.equal(settings['fontFamily'], 'roboto');
    assert.equal(settings['pomodoroFocusMs'], 30 * 60 * 1000);
    assert.equal(settings['fontScale'], 1.2);
    // Partial updates still work on top of legacy-loaded state.
    app2.useSettingsStore.getState().updateSettings({ theme: 'dark' });
    assert.equal(readSettings(app2)['theme'], 'dark');
  });

  it('resetSettings restores defaults without dead fields', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({ theme: 'light' });
    app.useSettingsStore.getState().resetSettings();
    const settings = readSettings(app);
    assert.equal(settings['theme'], 'dark');
    assert.equal(settings['fontScale'], 1.0);
    for (const key of REMOVED_KEYS) {
      assert.ok(!(key in settings), `expected reset defaults without ${key}`);
    }
  });

  it('persisted JSON round-trips active keys', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({ fontScale: 1.5 });
    const raw = mmkvMock().__readRaw(SETTINGS_KEY);
    assert.ok(typeof raw === 'string' && raw.length > 0, 'expected persisted bytes');
    const parsed = JSON.parse(raw as string) as {
      state?: { settings?: Record<string, unknown> };
    };
    assert.equal(parsed.state?.settings?.['fontScale'], 1.5);
    assert.equal(parsed.state?.settings?.['theme'], 'dark');
  });

  it('boolean switch updates persist and leave related toggles untouched', async () => {
    const app = await loadStores();
    app.useSettingsStore
      .getState()
      .updateSettings({ hapticsEnabled: false });
    const raw = mmkvMock().__readRaw(SETTINGS_KEY);
    assert.ok(typeof raw === 'string' && raw.length > 0, 'expected persisted bytes');
    const parsed = JSON.parse(raw as string) as {
      state?: { settings?: Record<string, unknown> };
    };
    assert.equal(parsed.state?.settings?.['hapticsEnabled'], false);
    assert.equal(parsed.state?.settings?.['keepScreenAwake'], true);
    assert.equal(parsed.state?.settings?.['fullscreenMode'], true);
    assert.equal(parsed.state?.settings?.['reducedMotion'], false);
  });

  it('stale persisted bytes missing newer keys rehydrate with default values (no undefined/0s)', async () => {
    await loadStores();
    // Snapshot written by an older schema: predates long breaks, the
    // long-break session count, the daily focus goal, font scale, and the
    // countdown completion behavior. Relaunch must fill every one.
    const stale = {
      theme: 'light',
      accentColor: '#0066FF',
      fontFamily: 'roboto',
      pomodoroFocusMs: 30 * 60 * 1000,
      pomodoroBreakMs: 10 * 60 * 1000,
      hapticsEnabled: true,
      keepScreenAwake: true,
      fullscreenMode: true,
      reducedMotion: false,
      notificationsAsked: true,
    };
    mmkvMock()
      .createMMKV()
      .set(SETTINGS_KEY, JSON.stringify({ state: { settings: stale }, version: 0 }));

    const app2 = await relaunch();
    const settings = readSettings(app2);
    // Missing newer keys come from DEFAULT_SETTINGS.
    assert.equal(settings['pomodoroLongBreakMs'], 15 * 60 * 1000);
    assert.equal(settings['pomodoroSessionsBeforeLongBreak'], 4);
    assert.equal(settings['dailyFocusGoalMs'], 2 * 60 * 60 * 1000);
    assert.equal(settings['fontScale'], 1.0);
    assert.equal(settings['timerCompletionBehavior'], 'stop');
    // Persisted values survive the merge untouched.
    assert.equal(settings['theme'], 'light');
    assert.equal(settings['accentColor'], '#0066FF');
    assert.equal(settings['pomodoroFocusMs'], 30 * 60 * 1000);
    assert.equal(settings['notificationsAsked'], true);
  });

  it('every displayed numeric setting is a defined, finite number', async () => {
    const app = await loadStores();
    const settings = readSettings(app);
    const NUMERIC_KEYS = [
      'pomodoroFocusMs',
      'pomodoroBreakMs',
      'pomodoroLongBreakMs',
      'countdownDurationMs',
      'intervalWorkMs',
      'intervalRestMs',
      'intervalRounds',
      'dailyFocusGoalMs',
      'pomodoroSessionsBeforeLongBreak',
      'fontScale',
    ] as const;
    for (const key of NUMERIC_KEYS) {
      assert.equal(typeof settings[key], 'number', `${key} is a number`);
      assert.ok(
        Number.isFinite(settings[key] as number),
        `${key} is finite`
      );
      assert.ok(!Number.isNaN(settings[key] as number), `${key} is not NaN`);
    }
  });
});
