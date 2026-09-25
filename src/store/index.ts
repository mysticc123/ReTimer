import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { AppSettings, DEFAULT_SETTINGS, FocusSession, PomodoroConfig, TimerState } from '../types';
import { migrateLegacyFontSize } from '../utils/fontScale';
import { normalizeLabel } from '../types';
import { playCompletionSound, withoutCompletionSound } from '../services/completionSound';

// Initialize MMKV storage
const storage = createMMKV();

// Create MMKV adapter for Zustand persistence
const mmkvStorage = {
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  getItem: (key: string) => {
    const value = storage.getString(key);
    return value ?? null;
  },
  removeItem: (key: string) => {
    storage.remove(key);
  },
};

/**
 * Phase 1A: focus-session history foundation. Issue #11: the phase clock
 * lives in persisted TimerState (not module scope) so a running or paused
 * phase survives process death together with its session: it is written in
 * the same set() as the status/target it describes, so the two can never
 * tear. Pause/resume leave it untouched; initialize/reset/clear and
 * terminal completions null it.
 */

/** Monotonic counter disambiguating record IDs within the same millisecond. */
let sessionCounter = 0;

/** Upper bound on persisted history (newest retained). */
const MAX_SESSIONS = 500;

const isValidStartedAt = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Development-only diagnostic (silent in production builds). */
const devWarn = (message: string): void => {
  const runtime = globalThis as {
    __DEV__?: boolean;
    console?: { warn(message: string): void };
  };
  if (runtime.__DEV__ === true) {
    runtime.console?.warn(`[ReTimer] ${message}`);
  }
};

/**
 * Settings Store
 * Handles persisted app settings
 */
interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: (() => {
        // Migration: convert legacy largerText boolean to fontScale number
        const storedData = mmkvStorage.getItem('retimer-settings');
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            if (parsed.state?.settings) {
              const legacyLargerText = parsed.state.settings.largerText;
              if (legacyLargerText !== undefined) {
                // Migrate the old boolean to new fontScale
                const fontScale = migrateLegacyFontSize(legacyLargerText);
                return {
                  ...DEFAULT_SETTINGS,
                  ...parsed.state.settings,
                  largerText: undefined, // Remove old property
                  fontScale, // Set new property
                };
              }
            }
          } catch (e) {
            // If parsing fails, use defaults
          }
        }
        return DEFAULT_SETTINGS;
      })(),
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'retimer-settings',
      storage: createJSONStorage(() => mmkvStorage),
      // Rehydrated settings must never be missing keys: a persisted snapshot
      // written by an older schema (before long breaks, session counts,
      // daily goal, fontScale, or completion behavior existed) shallow-
      // replaces the whole `settings` object, leaving those newer keys
      // undefined -> the UI showed "0s" / "undefined". Merging against
      // DEFAULT_SETTINGS fills every absent key while keeping every
      // persisted value. This is the single source of truth for validity:
      // the screen no longer needs per-row `?? ''` fallbacks.
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }
        const persisted = persistedState as {
          settings?: Record<string, unknown>;
        };
        const rawSettings = persisted.settings;
        if (rawSettings && typeof rawSettings === 'object') {
          return {
            ...currentState,
            ...persisted,
            settings: { ...DEFAULT_SETTINGS, ...rawSettings } as AppSettings,
          };
        }
        return currentState;
      },
    }
  )
);

/**
 * Timer Store
 * Handles timer state and actions
 */
interface TimerStoreState {
  timer: TimerState;
  
  // Timer lifecycle actions
  initializeTimer: (mode: TimerState['mode'], durationMs: number, intervalConfig?: any, pomodoroConfig?: PomodoroConfig, label?: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  completeTimer: () => void;

  // Interval timer actions
  nextRound: () => void;

  // Pomodoro phase actions (Focus <-> Break cycle)
  nextPomodoroPhase: () => void;

  // Phase 1A: focus-session history (persisted, bounded, data-only)
  sessions: FocusSession[];
  clearSessionHistory: () => void;
  
  // State updates
  updateElapsedTime: (elapsedMs: number) => void;
  
  // Utility
  getRemainingTime: () => number;
  clearTimer: () => void;
}

const createInitialTimerState = (): TimerState => ({
  mode: 'pomodoro',
  durationMs: 25 * 60 * 1000,
  intervalConfig: undefined,
  status: 'idle',
  targetTimestamp: null,
  pausedAt: null,
  elapsedTimeMs: 0,
  currentRound: 0,
  totalRounds: 1,
  isWorkPhase: true,
  pomodoroFocusCount: 0,
  phaseStartedAtMs: null,
  label: undefined,
});

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set, get) => ({
      timer: createInitialTimerState(),
      sessions: [],

      initializeTimer: (mode, durationMs, intervalConfig, pomodoroConfig, label) => {
        const totalRounds = intervalConfig?.rounds ?? 1;
        // A freshly initialized timer has no active phase yet.
        set({
          timer: {
            mode,
            durationMs,
            intervalConfig,
            pomodoroConfig: mode === 'pomodoro' ? pomodoroConfig : undefined,
            status: 'idle',
            targetTimestamp: null,
            pausedAt: null,
            elapsedTimeMs: 0,
            currentRound: 0,
            totalRounds,
            isWorkPhase: true,
            pomodoroFocusCount: 0,
            phaseStartedAtMs: null,
            label: normalizeLabel(label),
          },
        });
      },

      startTimer: () => {
        const { timer } = get();
        if (timer.status !== 'idle' && timer.status !== 'paused') return;

        const now = Date.now();
        // Count-up tracks elapsed as now - targetTimestamp, so anchor target in the past.
        const targetTimestamp =
          timer.mode === 'countup'
            ? now - timer.elapsedTimeMs
            : now + (timer.durationMs - timer.elapsedTimeMs);

        // Fresh phase start (not a resume): anchor the phase clock used
        // by focus-session history. Resumes must not move it.
        set({
          timer: {
            ...timer,
            status: 'running',
            targetTimestamp,
            pausedAt: null,
            phaseStartedAtMs:
              timer.status === 'idle' ? now : timer.phaseStartedAtMs,
          },
        });
      },

      pauseTimer: () => {
        const { timer } = get();
        if (timer.status !== 'running') return;

        const now = Date.now();
        const elapsed =
          timer.mode === 'countup' && timer.targetTimestamp
            ? now - timer.targetTimestamp
            : timer.targetTimestamp
              ? timer.durationMs - (timer.targetTimestamp - now)
              : timer.elapsedTimeMs;

        set({
          timer: {
            ...timer,
            status: 'paused',
            elapsedTimeMs: Math.max(0, elapsed),
            targetTimestamp: null,
            pausedAt: now,
          },
        });
      },

      resumeTimer: () => {
        const { timer } = get();
        if (timer.status !== 'paused') return;

        const now = Date.now();
        // A paused phase with no phase clock is a staged (manual-transition)
        // phase that has never started: beginning it anchors the clock now.
        // Ordinary mid-phase resumes keep the existing clock untouched.
        const phaseStartedAtMs =
          timer.phaseStartedAtMs === null ? now : timer.phaseStartedAtMs;
        const targetTimestamp =
          timer.mode === 'countup'
            ? now - timer.elapsedTimeMs
            : now + (timer.durationMs - timer.elapsedTimeMs);

        set({
          timer: {
            ...timer,
            status: 'running',
            targetTimestamp,
            pausedAt: null,
            phaseStartedAtMs,
          },
        });
      },

      resetTimer: () => {
        const { timer } = get();
        // A reset Pomodoro always restarts at Focus with the full Focus duration,
        // even if reset happened mid-Break. An Interval always restarts at Work
        // with the full Work duration. Other modes keep existing behavior.
        const pomodoroConfig = timer.mode === 'pomodoro' ? timer.pomodoroConfig : undefined;
        const intervalConfig = timer.mode === 'interval' ? timer.intervalConfig : undefined;
        // The abandoned partial phase is not recorded; no phase is active now.
        set({
          timer: {
            ...timer,
            status: 'idle',
            targetTimestamp: null,
            pausedAt: null,
            elapsedTimeMs: 0,
            currentRound: 0,
            isWorkPhase: true,
            pomodoroFocusCount: 0,
            durationMs: pomodoroConfig
              ? pomodoroConfig.focusMs
              : intervalConfig
              ? intervalConfig.workMs
              : timer.durationMs,
            phaseStartedAtMs: null,
            label: undefined,
          },
        });
      },

      completeTimer: () => {
        const { timer, sessions: storedSessions } = get();
        // Exactly-once completion: only a running timer can complete.
        // This ignores stale RAF frames, repeated restore attempts, and
        // repeated calls on an already-completed timer.
        if (timer.status !== 'running') return;

        const completedAtMs = Date.now();
        let sessions = storedSessions;

        // Focus-only history: countdown completions (plus legacy config-less
        // pomodoro timers, recorded as focus). Count-up has no completion
        // semantics and never records.
        if (timer.mode === 'countdown' || timer.mode === 'pomodoro') {
          if (isValidStartedAt(timer.phaseStartedAtMs)) {
            const record: FocusSession = {
              id: `${completedAtMs}-${++sessionCounter}`,
              mode: timer.mode === 'pomodoro' ? 'pomodoro' : 'countdown',
              phase: timer.mode === 'pomodoro' ? 'focus' : 'single',
              plannedDurationMs: timer.durationMs,
              actualDurationMs: timer.durationMs,
              startedAtMs: timer.phaseStartedAtMs,
              completedAtMs,
              label: timer.label,
            };
            sessions = [...sessions, record].slice(-MAX_SESSIONS);
          } else {
            devWarn(
              `Skipping focus-session record for ${timer.mode}: missing phase start timestamp. Transition preserved.`
            );
          }
        }

        // P9: Countdown repeat. When the persisted completion behavior is
        // 'repeat', a finished Countdown cycle restarts immediately as a
        // fresh running phase (same duration, same label) instead of
        // stopping. The finished cycle is already recorded exactly once
        // above; the new cycle gets a new target and a new phase clock, so
        // exactly-once and history-cap rules keep holding per cycle.
        // Countdown-only: every other mode, and every other behavior value
        // (including legacy 'continue'), keeps the existing stop semantics.
        // A non-positive duration can never repeat (its new target would
        // already be past); it stops instead.
        const repeatCountdown =
          timer.mode === 'countdown' &&
          timer.durationMs > 0 &&
          useSettingsStore.getState().settings.timerCompletionBehavior ===
            'repeat';

        if (repeatCountdown) {
          set({
            timer: {
              ...timer,
              status: 'running',
              targetTimestamp: completedAtMs + timer.durationMs,
              pausedAt: null,
              elapsedTimeMs: 0,
              phaseStartedAtMs: completedAtMs,
            },
            sessions,
          });
        } else {
          set({
            timer: {
              ...timer,
              status: 'completed',
              targetTimestamp: null,
              elapsedTimeMs: timer.durationMs,
              phaseStartedAtMs: null,
            },
            sessions,
          });
        }

        // P10: the completion sound is decided and dispatched from the
        // canonical completion transition (exactly-once by construction),
        // not from any screen. Count-up never reaches here, so it never
        // sounds. The pre-transition `timer` describes the phase that just
        // finished, which is exactly what the sound decision reads.
        playCompletionSound(timer, useSettingsStore.getState().settings);

        // Trigger completion callback if exists
        if (timer.onComplete) {
          timer.onComplete();
        }
      },

      nextRound: () => {
        const { timer, sessions: storedSessions } = get();
        if (!timer.intervalConfig) return;

        const now = Date.now();
        let sessions = storedSessions;
        // User-controlled auto-start (existing persisted setting).
        // Manual mode stages the next phase stopped; Start begins it.
        const autoStart = useSettingsStore.getState().settings.autoStartNextInterval;

        // Each round is work + rest. currentRound is 0-indexed.
        // Finishing work -> same round rest. Finishing rest of last round -> completed.
        if (!timer.isWorkPhase) {
          // Just finished a rest phase: transition only, never a focus record.
          if (timer.currentRound + 1 >= timer.totalRounds) {
            set({
              timer: {
                ...timer,
                status: 'completed',
                targetTimestamp: null,
                pausedAt: null,
                elapsedTimeMs: timer.intervalConfig.restMs,
                isWorkPhase: false,
                phaseStartedAtMs: null,
              },
              sessions,
            });
            playCompletionSound(timer, useSettingsStore.getState().settings);
            return;
          }
        } else if (isValidStartedAt(timer.phaseStartedAtMs)) {
          // Just finished a work phase: record the focus session.
          const record: FocusSession = {
            id: `${now}-${++sessionCounter}`,
            mode: 'interval',
            phase: 'work',
            round: timer.currentRound,
            totalRounds: timer.totalRounds,
            plannedDurationMs: timer.durationMs,
            actualDurationMs: timer.durationMs,
            startedAtMs: timer.phaseStartedAtMs,
            completedAtMs: now,
            label: timer.label,
          };
          sessions = [...sessions, record].slice(-MAX_SESSIONS);
        } else {
          devWarn(
            'Skipping focus-session record for interval work: missing phase start timestamp. Transition preserved.'
          );
        }

        const nextIsWorkPhase = !timer.isWorkPhase;
        const nextRound = !timer.isWorkPhase ? timer.currentRound + 1 : timer.currentRound;

        // Determine duration for next phase
        const durationMs = nextIsWorkPhase
          ? timer.intervalConfig.workMs
          : timer.intervalConfig.restMs;

        if (!autoStart) {
          // Manual mode: stage the next phase stopped with a full duration
          // and no target. Start (resume) begins it and anchors the clock.
          set({
            timer: {
              ...timer,
              currentRound: nextRound,
              isWorkPhase: nextIsWorkPhase,
              durationMs,
              elapsedTimeMs: 0,
              status: 'paused',
              targetTimestamp: null,
              pausedAt: now,
              phaseStartedAtMs: null,
            },
            sessions,
          });
          return;
        }

        const targetTimestamp = now + durationMs;

        set({
          timer: {
            ...timer,
            currentRound: nextRound,
            isWorkPhase: nextIsWorkPhase,
            durationMs,
            elapsedTimeMs: 0,
            status: 'running',
            targetTimestamp,
            pausedAt: null,
            phaseStartedAtMs: now,
          },
          sessions,
        });
        playCompletionSound(timer, useSettingsStore.getState().settings);
      },

      nextPomodoroPhase: () => {
        const { timer, sessions: storedSessions } = get();
        if (timer.mode !== 'pomodoro' || !timer.pomodoroConfig) return;

        const now = Date.now();
        let sessions = storedSessions;

        // Focus-only history: a finishing focus phase records; a finishing
        // break phase transitions silently.
        if (timer.isWorkPhase) {
          if (isValidStartedAt(timer.phaseStartedAtMs)) {
            const record: FocusSession = {
              id: `${now}-${++sessionCounter}`,
              mode: 'pomodoro',
              phase: 'focus',
              plannedDurationMs: timer.durationMs,
              actualDurationMs: timer.durationMs,
              startedAtMs: timer.phaseStartedAtMs,
              completedAtMs: now,
              label: timer.label,
            };
            sessions = [...sessions, record].slice(-MAX_SESSIONS);
          } else {
            devWarn(
              'Skipping focus-session record for pomodoro focus: missing phase start timestamp. Transition preserved.'
            );
          }
          // Increment focus count when a focus phase completes
          const nextFocusCount = timer.pomodoroFocusCount + 1;
          const sessionsBeforeLongBreak = timer.pomodoroConfig.sessionsBeforeLongBreak ?? 4;
          const isLongBreak = nextFocusCount >= sessionsBeforeLongBreak;

          // Pure alternation: Focus -> Break -> Focus ... 
          // Manual phases: the next phase is staged stopped (paused with a
          // full duration and no target). The user presses Start to begin it,
          // which anchors the phase clock via resumeTimer. No auto-start.
          const nextIsWorkPhase = false; // Next phase is always a break after focus
          const durationMs = isLongBreak
            ? timer.pomodoroConfig.longBreakMs
            : timer.pomodoroConfig.breakMs;

          set({
            timer: {
              ...timer,
              isWorkPhase: nextIsWorkPhase,
              durationMs,
              elapsedTimeMs: 0,
              status: 'paused',
              targetTimestamp: null,
              pausedAt: now,
              phaseStartedAtMs: null,
              pomodoroFocusCount: isLongBreak ? 0 : nextFocusCount,
            },
            sessions,
          });
        } else {
          // Break phase completed (short or long break) - transition to focus
          // Reset focus count to 0 after long break, keep current count after short break
          const sessionsBeforeLongBreak = timer.pomodoroConfig.sessionsBeforeLongBreak ?? 4;
          const wasLongBreak = timer.pomodoroFocusCount === 0; // After long break, focus count is reset to 0

          set({
            timer: {
              ...timer,
                isWorkPhase: true,
                durationMs: timer.pomodoroConfig.focusMs,
                elapsedTimeMs: 0,
                status: 'paused',
                targetTimestamp: null,
                pausedAt: now,
                phaseStartedAtMs: null,
                pomodoroFocusCount: wasLongBreak ? 0 : timer.pomodoroFocusCount,
              },
              sessions,
            });
        }

        playCompletionSound(timer, useSettingsStore.getState().settings);
      },

      updateElapsedTime: (elapsedMs) => {
        const { timer } = get();
        set({
          timer: {
            ...timer,
            elapsedTimeMs: elapsedMs,
          },
        });
      },

      clearSessionHistory: () => {
        set({ sessions: [] });
      },

      getRemainingTime: () => {
        const { timer } = get();
        if (!timer.targetTimestamp) {
          return Math.max(0, timer.durationMs - timer.elapsedTimeMs);
        }
        return Math.max(0, timer.targetTimestamp - Date.now());
      },

      clearTimer: () => {
        set({ timer: createInitialTimerState() });
      },
    }),
    {
      name: 'retimer-timer-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => {
        // Never persist callbacks: explicitly strip onComplete (functions
        // cannot survive JSON storage) alongside the runtime-state reset.
        // History records are pure data and persist bounded, newest last.
        // Issue #11: the live status, targetTimestamp, pausedAt, and
        // phaseStartedAtMs persist verbatim so a running or paused phase
        // reconstructs after process death. Elapsed time was already
        // persisted; together they fully describe the phase.
        const { onComplete: _omittedCallback, ...persistableTimer } = state.timer;
        void _omittedCallback;
        return {
          timer: {
            ...persistableTimer,
          },
          sessions: state.sessions.slice(-MAX_SESSIONS),
        };
      },
    }
  )
);

/**
 * Restore timer state on app launch (Issue #11).
 *
 * The persisted snapshot is authoritative: status, targetTimestamp,
 * elapsedTimeMs, and phaseStartedAtMs were written together, so the live
 * phase reconstructs exactly.
 * - running + future target: left running; ActiveTimer recomputes the
 *   display from the timestamp and the notification service reschedules.
 * - running + past target (finished while dead): routed through the mode's
 *   NORMAL transition — countdown completes, pomodoro advances phase,
 *   interval advances round — so recording rules (focus/work only,
 *   exactly-once guards) apply unchanged. A second launch finds a
 *   non-running state and no-ops, so no duplicate history.
 * - running count-up: left running; its anchor is permanently in the past
 *   by design, and count-up never completes. Elapsed time reconstructs as
 *   now - targetTimestamp with no action needed.
 * - running without a target (corrupt/legacy): coerced to idle rather
 *   than leaving the UI stuck.
 * - paused/completed/idle: left untouched. Paused keeps its frozen elapsed
 *   time and its phase clock; completed is terminal and never resurrected.
 */
export const restoreTimerState = () => {
  const store = useTimerStore.getState();
  const { timer } = store;

  if (timer.status !== 'running') return;
  if (timer.mode === 'countup') return;
  if (typeof timer.targetTimestamp !== 'number') {
    store.resetTimer();
    return;
  }
  if (timer.targetTimestamp - Date.now() > 0) {
    // Still running: UI and notifications pick up the persisted
    // targetTimestamp with no further action.
    return;
  }
  // Finished while dead: use the mode's own transition so history rules
  // (focus/work records only, exactly-once) hold exactly as foreground.
  // P10: a phase that elapsed while the process was dead is not a live
  // completion event, so the recovery transition is dispatched silently.
  withoutCompletionSound(() => {
    if (timer.mode === 'countdown') {
      store.completeTimer();
    } else if (timer.mode === 'pomodoro') {
      store.nextPomodoroPhase();
    } else if (timer.mode === 'interval') {
      store.nextRound();
    }
  });
  // If the transition declined (e.g. a legacy snapshot missing its phase
  // config), the phase would sit expired-but-running forever: fall back to
  // idle with no record rather than leaving the UI stuck.
  const after = useTimerStore.getState().timer;
  if (
    after.status === 'running' &&
    typeof after.targetTimestamp === 'number' &&
    after.targetTimestamp - Date.now() <= 0
  ) {
    store.resetTimer();
  }
};
