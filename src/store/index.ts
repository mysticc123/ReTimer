import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { AppSettings, DEFAULT_SETTINGS, FocusSession, PomodoroConfig, TimerState, TimerStatus } from '../types';
import { migrateLegacyFontSize } from '../utils/fontScale';

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
 * Phase 1A: focus-session history foundation.
 *
 * `phaseStartedAtMs` is the wall-clock moment the CURRENT phase began
 * running. It is module-scoped (never in TimerState, never persisted) so it
 * cannot go stale: pause/resume leave it untouched, and an app reload wipes
 * it exactly when the persisted timer is forced back to idle.
 * - set on fresh starts (idle -> running) and on every phase transition,
 * - cleared on initialize/reset/clear and on terminal completion,
 * - never touched by pause/resume.
 */
let phaseStartedAtMs: number | null = null;

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
  initializeTimer: (mode: TimerState['mode'], durationMs: number, intervalConfig?: any, pomodoroConfig?: PomodoroConfig) => void;
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
});

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set, get) => ({
      timer: createInitialTimerState(),
      sessions: [],

      initializeTimer: (mode, durationMs, intervalConfig, pomodoroConfig) => {
        const totalRounds = intervalConfig?.rounds ?? 1;
        // A freshly initialized timer has no active phase yet.
        phaseStartedAtMs = null;

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

        if (timer.status === 'idle') {
          // Fresh phase start (not a resume): anchor the phase clock used
          // by focus-session history. Resumes must not move it.
          phaseStartedAtMs = now;
        }

        set({
          timer: {
            ...timer,
            status: 'running',
            targetTimestamp,
            pausedAt: null,
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
        if (phaseStartedAtMs === null) {
          phaseStartedAtMs = now;
        }
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
          },
        });
      },

      resetTimer: () => {
        const { timer } = get();
        // A reset Pomodoro always restarts at Focus with the full Focus duration,
        // even if reset happened mid-Break. Other modes keep existing behavior.
        const pomodoroConfig = timer.mode === 'pomodoro' ? timer.pomodoroConfig : undefined;
        // The abandoned partial phase is not recorded; no phase is active now.
        phaseStartedAtMs = null;
        set({
          timer: {
            ...timer,
            status: 'idle',
            targetTimestamp: null,
            pausedAt: null,
            elapsedTimeMs: 0,
            currentRound: 0,
            isWorkPhase: true,
            durationMs: pomodoroConfig ? pomodoroConfig.focusMs : timer.durationMs,
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
          if (isValidStartedAt(phaseStartedAtMs)) {
            const record: FocusSession = {
              id: `${completedAtMs}-${++sessionCounter}`,
              mode: timer.mode === 'pomodoro' ? 'pomodoro' : 'countdown',
              phase: timer.mode === 'pomodoro' ? 'focus' : 'single',
              plannedDurationMs: timer.durationMs,
              actualDurationMs: timer.durationMs,
              startedAtMs: phaseStartedAtMs,
              completedAtMs,
            };
            sessions = [...sessions, record].slice(-MAX_SESSIONS);
          } else {
            devWarn(
              `Skipping focus-session record for ${timer.mode}: missing phase start timestamp. Transition preserved.`
            );
          }
        }
        phaseStartedAtMs = null;

        set({
          timer: {
            ...timer,
            status: 'completed',
            targetTimestamp: null,
            elapsedTimeMs: timer.durationMs,
          },
          sessions,
        });

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
            phaseStartedAtMs = null;
            set({
              timer: {
                ...timer,
                status: 'completed',
                targetTimestamp: null,
                pausedAt: null,
                elapsedTimeMs: timer.intervalConfig.restMs,
                isWorkPhase: false,
              },
              sessions,
            });
            return;
          }
        } else if (isValidStartedAt(phaseStartedAtMs)) {
          // Just finished a work phase: record the focus session.
          const record: FocusSession = {
            id: `${now}-${++sessionCounter}`,
            mode: 'interval',
            phase: 'work',
            round: timer.currentRound,
            totalRounds: timer.totalRounds,
            plannedDurationMs: timer.durationMs,
            actualDurationMs: timer.durationMs,
            startedAtMs: phaseStartedAtMs,
            completedAtMs: now,
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
          phaseStartedAtMs = null;
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
            },
            sessions,
          });
          return;
        }

        const targetTimestamp = now + durationMs;
        phaseStartedAtMs = now;

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
          },
          sessions,
        });
      },

      nextPomodoroPhase: () => {
        const { timer, sessions: storedSessions } = get();
        if (timer.mode !== 'pomodoro' || !timer.pomodoroConfig) return;

        const now = Date.now();
        let sessions = storedSessions;

        // Focus-only history: a finishing focus phase records; a finishing
        // break phase transitions silently.
        if (timer.isWorkPhase) {
          if (isValidStartedAt(phaseStartedAtMs)) {
            const record: FocusSession = {
              id: `${now}-${++sessionCounter}`,
              mode: 'pomodoro',
              phase: 'focus',
              plannedDurationMs: timer.durationMs,
              actualDurationMs: timer.durationMs,
              startedAtMs: phaseStartedAtMs,
              completedAtMs: now,
            };
            sessions = [...sessions, record].slice(-MAX_SESSIONS);
          } else {
            devWarn(
              'Skipping focus-session record for pomodoro focus: missing phase start timestamp. Transition preserved.'
            );
          }
        }

        // Pure alternation: Focus -> Break -> Focus ... (no round counting,
        // so no off-by-one is possible).
        // Manual phases: the next phase is staged stopped (paused with a
        // full duration and no target). The user presses Start to begin it,
        // which anchors the phase clock via resumeTimer. No auto-start.
        const nextIsWorkPhase = !timer.isWorkPhase;
        const durationMs = nextIsWorkPhase
          ? timer.pomodoroConfig.focusMs
          : timer.pomodoroConfig.breakMs;

        phaseStartedAtMs = null;

        set({
          timer: {
            ...timer,
            isWorkPhase: nextIsWorkPhase,
            durationMs,
            elapsedTimeMs: 0,
            status: 'paused',
            targetTimestamp: null,
            pausedAt: now,
          },
          sessions,
        });
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
        phaseStartedAtMs = null;
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
        const { onComplete: _omittedCallback, ...persistableTimer } = state.timer;
        void _omittedCallback;
        return {
          timer: {
            ...persistableTimer,
            status: 'idle' as TimerStatus,
            targetTimestamp: null,
            pausedAt: null,
          },
          sessions: state.sessions.slice(-MAX_SESSIONS),
        };
      },
    }
  )
);

/**
 * Restore timer state on app launch
 * This should be called when the app starts
 */
export const restoreTimerState = () => {
  const { timer, startTimer } = useTimerStore.getState();
  
  // If timer was running, recalculate state based on timestamps
  if (timer.status === 'running' && timer.targetTimestamp) {
    const now = Date.now();
    const remaining = timer.targetTimestamp - now;
    
    if (remaining <= 0) {
      // Timer completed while app was closed
      useTimerStore.getState().completeTimer();
    } else {
      // Timer still running, keep it running with updated timestamp
      // The UI will pick up the correct remaining time
    }
  }
};
