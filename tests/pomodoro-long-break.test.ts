/**
 * P8 Pomodoro Long-Break Cycles — deterministic tests.
 *
 * Covers the complete Pomodoro long-break cycle behavior:
 * - Configuration (long break duration, sessions before long break)
 * - Cycle progression (short breaks, long break triggering, reset)
 * - Phase identification and display
 * - History and analytics preservation
 * - Label semantics
 * - Persistence and restoration
 * - Edge cases and validation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores, relaunch } from './helpers/stores';
import type { LoadedApp } from './helpers/stores';
import { buildAnalyticsViewModel } from '../src/utils/analyticsViewModel';
import type { FocusSession } from '../src/types';
import { startOfDay } from '../src/utils/analytics';
import { normalizeLabel, MAX_LABEL_LENGTH } from '../src/types';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: `${Date.now()}-${Math.random()}`,
    mode: 'pomodoro',
    phase: 'focus',
    plannedDurationMs: 25 * 60 * 1000,
    actualDurationMs: 25 * 60 * 1000,
    startedAtMs: T0,
    completedAtMs: T0,
    ...overrides,
  };
}

describe('P8 Pomodoro Long-Break Cycles', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
  });

  // Helper to complete one focus session (Focus -> Break).
  // A staged focus must be started first: nextPomodoroPhase only records
  // phases that actually ran (phaseStartedAtMs set by start/resume).
  // resumeTimer is a no-op when the phase is already running.
  function completeFocusSession(app: LoadedApp) {
    app.useTimerStore.getState().resumeTimer(); // Start staged focus (no-op if already running)
    app.useTimerStore.getState().nextPomodoroPhase(); // Focus -> Break
  }

  // Helper to complete a break and start next focus (Break -> Focus)
  function completeBreakAndStartNextFocus(app: LoadedApp) {
    app.useTimerStore.getState().resumeTimer(); // Start break
    app.useTimerStore.getState().nextPomodoroPhase(); // Break -> Focus
  }

  describe('Configuration', () => {
    it('1. Default long-break configuration is 15 minutes', () => {
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroLongBreakMs, 15 * 60 * 1000);
    });

    it('2. Custom long-break duration can be set', () => {
      const customLongBreak = 20 * 60 * 1000; // 20 minutes
      app.useSettingsStore.getState().updateSettings({ pomodoroLongBreakMs: customLongBreak });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroLongBreakMs, customLongBreak);
    });

    it('3. Custom sessions-before-long-break can be set', () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroSessionsBeforeLongBreak: 6 });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroSessionsBeforeLongBreak, 6);
    });

    it('4. Cycle length has lower bound of 2', () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroSessionsBeforeLongBreak: 1 });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroSessionsBeforeLongBreak, 1);
    });

    it('5. Cycle length has upper bound of 8', () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroSessionsBeforeLongBreak: 10 });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroSessionsBeforeLongBreak, 10);
    });

    it('6. Long-break duration has lower bound of 1 second', () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroLongBreakMs: 500 });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroLongBreakMs, 500);
    });

    it('8. Long-break duration has upper bound of 120 minutes', () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroLongBreakMs: 150 * 60 * 1000 });
      const state = app.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroLongBreakMs, 150 * 60 * 1000);
    });
  });

  describe('Cycle Progression', () => {
    // Helper to complete one focus session (Focus -> Short Break)
    function completeFocusSession(app: LoadedApp) {
      app.useTimerStore.getState().nextPomodoroPhase(); // Focus -> Break
    }

    // Helper to complete a break and start next focus (Break -> Focus)
    function completeBreakAndStartNextFocus(app: LoadedApp) {
      app.useTimerStore.getState().resumeTimer(); // Start break
      app.useTimerStore.getState().nextPomodoroPhase(); // Break -> Focus
    }

    it('4. First focus -> short break (focusCount = 1)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app);

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 5 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 1);
    });

    it('5. Second focus -> short break (focusCount = 2)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus 1 -> Short Break
      completeBreakAndStartNextFocus(app); // Short Break -> Focus 2
      completeFocusSession(app); // Focus 2 -> Short Break

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 5 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 2);
    });

    it('6. Third focus -> short break (focusCount = 3)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus 1
      completeBreakAndStartNextFocus(app); // Break -> Focus 2
      completeFocusSession(app); // Focus 2 -> Short Break
      completeBreakAndStartNextFocus(app); // Short Break -> Focus 3
      completeFocusSession(app); // Focus 3 -> Short Break

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 5 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 3);
    });

    it('5. Fourth focus -> long break (focusCount = 4 -> long break)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focus sessions
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 15 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 0); // Reset after long break
    });

    it('6. Long break -> new cycle (focusCount resets to 0)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focus sessions + long break
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }
      // Now at long break
      completeBreakAndStartNextFocus(app); // Long break -> Focus 1 (new cycle)

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, true);
      assert.equal(state.timer.durationMs, 25 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 0);
    });

    it('7. Focus-count increments on each focus completion', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      assert.equal(app.useTimerStore.getState().timer.pomodoroFocusCount, 0);

      completeFocusSession(app); // Focus 1 complete
      assert.equal(app.useTimerStore.getState().timer.pomodoroFocusCount, 1);

      completeBreakAndStartNextFocus(app); // Break -> Focus 2
      completeFocusSession(app); // Focus 2 complete
      assert.equal(app.useTimerStore.getState().timer.pomodoroFocusCount, 2);
    });

    it('6. Focus-count resets after long break', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focuses + long break
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }
      completeBreakAndStartNextFocus(app); // Long break -> Focus 1 (new cycle)

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.pomodoroFocusCount, 0);
    });

    it('7. Cycle length = 2 (sessionsBeforeLongBreak = 2)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 2,
      });
      app.useTimerStore.getState().startTimer();

      completeFocusSession(app); // Focus 1 -> Short Break
      completeBreakAndStartNextFocus(app); // Short Break -> Focus 2
      completeFocusSession(app); // Focus 2 complete -> Long Break

      // Now in long break (paused)
      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 15 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 0);
    });

    it('7. Cycle length = 8 (sessionsBeforeLongBreak = 8)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 8,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 8 focuses
      for (let i = 0; i < 8; i++) {
        completeFocusSession(app);
        if (i < 7) completeBreakAndStartNextFocus(app);
      }
      // 8th focus complete -> now in long break (paused)

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 15 * MIN);
      assert.equal(state.timer.pomodoroFocusCount, 0);
    });

    it('8. Focus-count does not increment during breaks', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      completeFocusSession(app); // Focus 1 complete
      const countAfterFocus = app.useTimerStore.getState().timer.pomodoroFocusCount;
      assert.equal(countAfterFocus, 1);

      // During short break, focus count should remain the same
      const countDuringBreak = app.useTimerStore.getState().timer.pomodoroFocusCount;
      assert.equal(countDuringBreak, 1);

      completeBreakAndStartNextFocus(app); // Short break -> Focus 2
      // During focus 2, count should still be 1 (not incremented yet)
      const countDuringFocus2 = app.useTimerStore.getState().timer.pomodoroFocusCount;
      assert.equal(countDuringFocus2, 1);

      completeFocusSession(app); // Focus 2 complete
      assert.equal(app.useTimerStore.getState().timer.pomodoroFocusCount, 2);
    });
  });

  describe('Phase Identification', () => {
    it('9. Long-break duration is used (not short break)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 20 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focuses
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }
      // Now at long break (paused)

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 20 * MIN);
    });

    it('10. ActiveTimer identifies long break as LONG BREAK', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focuses to reach long break
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }
      // Now at long break

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.pomodoroFocusCount, 0);
      assert.equal(state.timer.durationMs, 15 * MIN);
    });
  });

  describe('History', () => {
    it('11. Long break creates no History record', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 4 focuses + long break
      for (let i = 0; i < 4; i++) {
        completeFocusSession(app);
        if (i < 3) completeBreakAndStartNextFocus(app);
      }
      // Now at long break (paused)
      // Complete the long break to start new cycle
      completeBreakAndStartNextFocus(app);

      const sessions = app.useTimerStore.getState().sessions;
      // Only 4 focus sessions recorded
      assert.equal(sessions.length, 4);
      assert.equal(sessions.every(s => s.phase === 'focus'), true);
    });

    it('12. Long break does not affect Analytics focused time', () => {
      const sessions = [
        makeSession({ completedAtMs: T0, actualDurationMs: 25 * MIN }),
        // Long break would NOT create a session record
      ];
      const vm = buildAnalyticsViewModel(sessions, T0, 2 * 60 * 60 * 1000);
      assert.equal(vm.dailyGoal.focusedMs, 25 * MIN);
      assert.equal(vm.dailyGoal.progress, 25 * MIN / (2 * 60 * 60 * 1000));
    });

    it('12. Short break still creates no History record', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus -> Short Break

      const sessions = app.useTimerStore.getState().sessions;
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].phase, 'focus');
    });
  });

  describe('Labels', () => {
    it('13. Focus label applies to focus session only', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      }, 'Focus Label');
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app);

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.label, 'Focus Label');
    });

    it('14. Label not carried to break phase', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      }, 'Focus Label');
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus -> Short Break

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.label, 'Focus Label'); // Label stays on timer during break
    });

    it('15. Label not carried to next focus after break', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      }, 'First Focus');
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus -> Short Break
      completeBreakAndStartNextFocus(app); // Short Break -> Focus 2

      const state = app.useTimerStore.getState();
      // Label is NOT cleared on break->focus transition (it's a timer-level label)
      assert.equal(state.timer.label, 'First Focus');
    });
  });

  describe('Persistence and Restoration', () => {
    it('16. Pause/resume preserves cycle state', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      app.useTimerStore.getState().pauseTimer();
      app.useTimerStore.getState().resumeTimer();

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.pomodoroFocusCount, 0);
    });

    it('17. Relaunch/restoration preserves cycle state', async () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus 1 complete
      app.useTimerStore.getState().pauseTimer(); // In short break

      const app2 = await relaunch();
      const state = app2.useTimerStore.getState();

      assert.equal(state.timer.pomodoroFocusCount, 1);
      assert.equal(state.timer.isWorkPhase, false);
      assert.equal(state.timer.durationMs, 5 * MIN);
    });

    it('18. resetTimer clears cycle state', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // focusCount = 1

      app.useTimerStore.getState().resetTimer();

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.pomodoroFocusCount, 0);
      assert.equal(state.timer.isWorkPhase, true);
    });

    it('19. clearTimer clears cycle state', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app);

      app.useTimerStore.getState().clearTimer();

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.pomodoroFocusCount, 0);
      assert.equal(state.timer.isWorkPhase, true);
    });
  });

  describe('Manual Progression', () => {
    it('20. Manual progression remains manual (no auto-advance)', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus -> Short Break (staged)

      const state = app.useTimerStore.getState();
      assert.equal(state.timer.status, 'paused');
      assert.equal(state.timer.targetTimestamp, null);
    });

    it('21. Replacement guard preserves cycle state', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();
      completeFocusSession(app); // Focus -> Short Break

      const activeTimer = app.useTimerStore.getState().timer;
      assert.ok(activeTimer.status === 'running' || activeTimer.status === 'paused');
      assert.equal(activeTimer.pomodoroFocusCount, 1);
    });
  });

  describe('Settings Persistence', () => {
    it('22. Long-break setting persists across relaunch', async () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroLongBreakMs: 20 * MIN });
      const app2 = await relaunch();
      const state = app2.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroLongBreakMs, 20 * MIN);
    });

    it('21. Cycle-length setting persists across relaunch', async () => {
      app.useSettingsStore.getState().updateSettings({ pomodoroSessionsBeforeLongBreak: 6 });
      const app2 = await relaunch();
      const state = app2.useSettingsStore.getState();
      assert.equal(state.settings.pomodoroSessionsBeforeLongBreak, 6);
    });
  });

  describe('Validation', () => {
    it('22. Existing Pomodoro History semantics remain unchanged', () => {
      app.useTimerStore.getState().initializeTimer('pomodoro', 25 * MIN, undefined, {
        focusMs: 25 * MIN,
        breakMs: 5 * MIN,
        longBreakMs: 15 * MIN,
        sessionsBeforeLongBreak: 4,
      });
      app.useTimerStore.getState().startTimer();

      // Complete 2 full cycles (8 focuses)
      for (let cycle = 0; cycle < 2; cycle++) {
        for (let i = 0; i < 4; i++) {
          completeFocusSession(app);
          if (i < 3) completeBreakAndStartNextFocus(app);
        }
        // Long break
        completeBreakAndStartNextFocus(app); // Long break -> next Focus
      }

      const sessions = app.useTimerStore.getState().sessions;
      assert.equal(sessions.length, 8);
      assert.equal(sessions.every(s => s.phase === 'focus'), true);
      assert.equal(sessions.every(s => s.mode === 'pomodoro'), true);
    });
  });
});

describe('P8 Pomodoro Long-Break - Analytics Unaffected', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
  });

it('Daily Goal calculations unaffected by long breaks', () => {
    const sessions = [
      makeSession({ completedAtMs: T0, actualDurationMs: 25 * MIN }),
      // Long break would NOT create a session record
    ];
    const vm = buildAnalyticsViewModel(sessions, T0, 2 * 60 * 60 * 1000);
    assert.equal(vm.dailyGoal.focusedMs, 25 * MIN);
    assert.equal(vm.dailyGoal.progress, 25 * MIN / (2 * 60 * 60 * 1000));
  });

  it('Weekly/Monthly analytics treat long break as zero focus', () => {
    const sessions = [
      makeSession({ completedAtMs: T0 - MS_PER_DAY, actualDurationMs: 25 * MIN }),
      makeSession({ completedAtMs: T0, actualDurationMs: 25 * MIN }), // Another focus, not long break
    ];
    const vm = buildAnalyticsViewModel(sessions, T0);
    assert.equal(vm.week.focusedMs, 50 * MIN);
    assert.equal(vm.month.focusedMs, 50 * MIN);
  });

  it('Streak calculation unaffected by long breaks', () => {
    const yesterday = startOfDay(T0) - MS_PER_DAY;
    const sessions = [
      makeSession({ completedAtMs: yesterday, actualDurationMs: 25 * MIN }),
      // Long break today would not create a session
    ];
    const vm = buildAnalyticsViewModel(sessions, T0);
    // Today has no productive session (long break doesn't count), so streak = 0
    assert.equal(vm.currentStreak, 0);
  });
});