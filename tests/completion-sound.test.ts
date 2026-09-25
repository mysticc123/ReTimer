/**
 * P10 Completion Sound — deterministic tests.
 *
 * The audio boundary is mocked (injected via setCompletionSoundPlayer), so
 * every assertion runs on plain Node with no native audio. Coverage mirrors
 * the feature contract: the persisted soundEnabled gate, configured-sound
 * resolution with a safe fallback, count-up suppression, one sound per
 * completed cycle (including Countdown Repeat), per-phase Pomodoro and
 * Interval behavior, exactly-once dispatch, silence on process-death
 * recovery, and failure isolation (a throwing player must never break the
 * completion transition or its history record).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadStores, relaunch } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';
import type { PomodoroConfig } from '../src/types/index.js';

const T0 = 1_700_000_000_000;
const DUR = 60_000;

const INTERVAL_CONFIG = { workMs: 30_000, restMs: 10_000, rounds: 2 };
const POMODORO_CONFIG: PomodoroConfig = {
  focusMs: 25 * 60_000,
  breakMs: 5 * 60_000,
  longBreakMs: 15 * 60_000,
  sessionsBeforeLongBreak: 2,
};

describe('P10 Completion Sound', () => {
  let app: LoadedApp;
  let played: string[];

  beforeEach(async () => {
    app = await loadStores();
    played = [];
    app.completionSound.setCompletionSoundPlayer((sound) => {
      played.push(sound);
    });
    clock.setNow(T0);
  });

  afterEach(() => {
    app.completionSound.setCompletionSoundPlayer(null);
    clock.restore();
  });

  it('1. soundEnabled=false plays no sound on completion', () => {
    app.useSettingsStore.getState().updateSettings({ soundEnabled: false });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();

    assert.deepEqual(played, []);
    assert.equal(app.useTimerStore.getState().timer.status, 'completed');
  });

  it('2. soundEnabled=true plays the default sound once on countdown completion', () => {
    assert.equal(app.useSettingsStore.getState().settings.soundEnabled, true);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();

    assert.deepEqual(played, ['gentle-chime']);
  });

  it('3. the configured sound is played', () => {
    app.useSettingsStore.getState().updateSettings({ completionSound: 'soft-gong' });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();

    assert.deepEqual(played, ['soft-gong']);
  });

  it('4. an invalid configured sound falls back safely', () => {
    app.useSettingsStore
      .getState()
      .updateSettings({ completionSound: 'not-a-real-sound' });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();

    assert.deepEqual(played, ['gentle-chime']);
  });

  it('5. count-up never plays a completion sound', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countup', DUR);
    api.startTimer();
    clock.advance(DUR * 5);
    api.completeTimer();

    assert.deepEqual(played, []);
    assert.equal(app.useTimerStore.getState().sessions.length, 0);
  });

  it('6. countdown repeat plays exactly one sound per completed cycle', () => {
    app.useSettingsStore.getState().updateSettings({ timerCompletionBehavior: 'repeat' });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();

    clock.advance(DUR + 1_000);
    api.completeTimer();
    assert.equal(app.useTimerStore.getState().timer.status, 'running');
    assert.equal(played.length, 1);

    clock.advance(DUR + 1_000);
    api.completeTimer();
    assert.equal(played.length, 2);

    assert.deepEqual(played, ['gentle-chime', 'gentle-chime']);
    assert.equal(app.useTimerStore.getState().sessions.length, 2);
  });

  it('7. a stale repeated completion callback plays no second sound', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();
    api.completeTimer();
    api.completeTimer();

    assert.deepEqual(played, ['gentle-chime']);
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('8. pomodoro focus and break completions each play once', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', POMODORO_CONFIG.focusMs, undefined, POMODORO_CONFIG);
    api.startTimer();

    clock.advance(POMODORO_CONFIG.focusMs + 1_000);
    api.nextPomodoroPhase();
    const afterFocus = app.useTimerStore.getState();
    assert.equal(afterFocus.timer.isWorkPhase, false);
    assert.equal(afterFocus.sessions.length, 1);
    assert.equal(played.length, 1);

    api.resumeTimer();
    clock.advance(POMODORO_CONFIG.breakMs + 1_000);
    api.nextPomodoroPhase();
    const afterBreak = app.useTimerStore.getState();
    assert.equal(afterBreak.timer.isWorkPhase, true);
    assert.equal(afterBreak.sessions.length, 1);
    assert.equal(played.length, 2);
  });

  it('9. a long break boundary plays like any other phase completion', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('pomodoro', POMODORO_CONFIG.focusMs, undefined, POMODORO_CONFIG);
    api.startTimer();

    // Focus #1 -> short break
    clock.advance(POMODORO_CONFIG.focusMs + 1_000);
    api.nextPomodoroPhase();
    let timer = app.useTimerStore.getState().timer;
    assert.equal(timer.isWorkPhase, false);
    assert.equal(timer.durationMs, POMODORO_CONFIG.breakMs);

    // Short break -> focus #2
    api.resumeTimer();
    clock.advance(POMODORO_CONFIG.breakMs + 1_000);
    api.nextPomodoroPhase();
    timer = app.useTimerStore.getState().timer;
    assert.equal(timer.isWorkPhase, true);
    assert.equal(timer.pomodoroFocusCount, 1);

    // Focus #2 -> long break (sessionsBeforeLongBreak = 2)
    api.resumeTimer();
    clock.advance(POMODORO_CONFIG.focusMs + 1_000);
    api.nextPomodoroPhase();
    timer = app.useTimerStore.getState().timer;
    assert.equal(timer.isWorkPhase, false);
    assert.equal(timer.durationMs, POMODORO_CONFIG.longBreakMs);

    assert.equal(played.length, 3);
    assert.equal(app.useTimerStore.getState().sessions.length, 2);
  });

  it('10. interval work and rest completions each play once', () => {
    app.useSettingsStore.getState().updateSettings({ autoStartNextInterval: true });
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', INTERVAL_CONFIG.workMs, INTERVAL_CONFIG);
    api.startTimer();

    clock.advance(INTERVAL_CONFIG.workMs + 1_000);
    api.nextRound();
    let state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, false);
    assert.equal(state.sessions.length, 1);
    assert.equal(played.length, 1);

    clock.advance(INTERVAL_CONFIG.restMs + 1_000);
    api.nextRound();
    state = app.useTimerStore.getState();
    assert.equal(state.timer.isWorkPhase, true);
    assert.equal(played.length, 2);
  });

  it('11. a throwing player never breaks completion or history', () => {
    app.completionSound.setCompletionSoundPlayer(() => {
      throw new Error('audio backend exploded');
    });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);

    assert.doesNotThrow(() => api.completeTimer());
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
  });

  it('12. a rejected async player never breaks completion or history', async () => {
    app.completionSound.setCompletionSoundPlayer(async () => {
      throw new Error('playback rejected');
    });
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);

    assert.doesNotThrow(() => api.completeTimer());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
  });

  it('13. no sound on pause, resume, or reset', () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(5_000);
    api.pauseTimer();
    clock.advance(5_000);
    api.resumeTimer();
    clock.advance(5_000);
    api.resetTimer();
    clock.advance(DUR * 2);

    assert.deepEqual(played, []);
    assert.equal(app.useTimerStore.getState().timer.status, 'idle');
  });

  it('14. no sound when a phase finished while the process was dead', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR / 2);

    app = await relaunch();
    played = [];
    app.completionSound.setCompletionSoundPlayer((sound) => {
      played.push(sound);
    });
    clock.advance(DUR / 2 + 1_000);

    app.restoreTimerState();
    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
    assert.deepEqual(played, []);
  });

  it('15. a second launch after recovery stays silent', async () => {
    const api = app.useTimerStore.getState();
    api.initializeTimer('interval', INTERVAL_CONFIG.workMs, INTERVAL_CONFIG);
    api.startTimer();
    clock.advance(INTERVAL_CONFIG.workMs + 1_000);

    app = await relaunch();
    played = [];
    app.completionSound.setCompletionSoundPlayer((sound) => {
      played.push(sound);
    });
    app.restoreTimerState();
    app.restoreTimerState();

    assert.deepEqual(played, []);
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
  });

  it('16. no player wired means the transition is still silent and correct', () => {
    app.completionSound.setCompletionSoundPlayer(null);
    const api = app.useTimerStore.getState();
    api.initializeTimer('countdown', DUR);
    api.startTimer();
    clock.advance(DUR + 1_000);
    api.completeTimer();

    const state = app.useTimerStore.getState();
    assert.equal(state.timer.status, 'completed');
    assert.equal(state.sessions.length, 1);
  });

  it('17. resolveCompletionSoundId accepts valid ids and falls back otherwise', () => {
    const { resolveCompletionSoundId, isCompletionSoundId, DEFAULT_COMPLETION_SOUND } =
      app.completionSound;
    assert.equal(resolveCompletionSoundId('digital-beep'), 'digital-beep');
    assert.equal(resolveCompletionSoundId('gentle-chime'), 'gentle-chime');
    assert.equal(resolveCompletionSoundId('soft-gong'), 'soft-gong');
    assert.equal(resolveCompletionSoundId(''), DEFAULT_COMPLETION_SOUND);
    assert.equal(resolveCompletionSoundId(undefined), DEFAULT_COMPLETION_SOUND);
    assert.equal(resolveCompletionSoundId(null), DEFAULT_COMPLETION_SOUND);
    assert.equal(resolveCompletionSoundId(42), DEFAULT_COMPLETION_SOUND);
    assert.equal(isCompletionSoundId('nope'), false);
    assert.equal(isCompletionSoundId('soft-gong'), true);
  });

  it('18. shouldPlayCompletionSound gates on enabled, running, and non-count-up', () => {
    const { shouldPlayCompletionSound } = app.completionSound;
    const on = { soundEnabled: true };
    const off = { soundEnabled: false };

    assert.equal(
      shouldPlayCompletionSound({ mode: 'countdown', status: 'running' }, on),
      true
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'pomodoro', status: 'running' }, on),
      true
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'interval', status: 'running' }, on),
      true
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'countup', status: 'running' }, on),
      false
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'countdown', status: 'running' }, off),
      false
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'countdown', status: 'paused' }, on),
      false
    );
    assert.equal(
      shouldPlayCompletionSound({ mode: 'countdown', status: 'completed' }, on),
      false
    );
  });

  it('19. withoutCompletionSound suppresses nested dispatch and restores after', () => {
    const { playCompletionSound, withoutCompletionSound } = app.completionSound;
    const timer = { mode: 'countdown', status: 'running' } as const;
    const settings = { soundEnabled: true, completionSound: 'gentle-chime' };

    const result = withoutCompletionSound(() => {
      playCompletionSound(timer, settings);
      playCompletionSound(timer, settings);
      return 'done';
    });

    assert.equal(result, 'done');
    assert.deepEqual(played, []);
    playCompletionSound(timer, settings);
    assert.deepEqual(played, ['gentle-chime']);
  });

  it('20. the sound settings persist across a relaunch', async () => {
    app.useSettingsStore
      .getState()
      .updateSettings({ soundEnabled: false, completionSound: 'digital-beep' });

    const app2 = await relaunch();
    const settings = app2.useSettingsStore.getState().settings;
    assert.equal(settings.soundEnabled, false);
    assert.equal(settings.completionSound, 'digital-beep');
  });
});
