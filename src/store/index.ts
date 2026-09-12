import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { AppSettings, DEFAULT_SETTINGS, TimerState, TimerStatus } from '../types';

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
      settings: DEFAULT_SETTINGS,
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
  initializeTimer: (mode: TimerState['mode'], durationMs: number, intervalConfig?: any) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  completeTimer: () => void;
  
  // Interval timer actions
  nextRound: () => void;
  
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

      initializeTimer: (mode, durationMs, intervalConfig) => {
        const totalRounds = intervalConfig?.rounds ?? 1;
        
        set({
          timer: {
            mode,
            durationMs,
            intervalConfig,
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
        const remainingMs = timer.durationMs - timer.elapsedTimeMs;
        const targetTimestamp = now + remainingMs;

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
        const elapsed = timer.targetTimestamp 
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
        const remainingMs = timer.durationMs - timer.elapsedTimeMs;
        const targetTimestamp = now + remainingMs;

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
        set({
          timer: {
            ...timer,
            status: 'idle',
            targetTimestamp: null,
            pausedAt: null,
            elapsedTimeMs: 0,
            currentRound: 0,
            isWorkPhase: true,
          },
        });
      },

      completeTimer: () => {
        const { timer } = get();
        set({
          timer: {
            ...timer,
            status: 'completed',
            targetTimestamp: null,
            elapsedTimeMs: timer.durationMs,
          },
        });
        
        // Trigger completion callback if exists
        if (timer.onComplete) {
          timer.onComplete();
        }
      },

      nextRound: () => {
        const { timer } = get();
        if (!timer.intervalConfig) return;

        const nextIsWorkPhase = !timer.isWorkPhase;
        let nextRound = timer.currentRound;
        
        // If we just finished a rest phase, increment the round counter
        if (!timer.isWorkPhase) {
          nextRound = timer.currentRound + 1;
        }
        
        // Check if all rounds are completed
        if (nextRound >= timer.totalRounds && !nextIsWorkPhase) {
          // All rounds completed - we finished the last rest phase
          set({
            timer: {
              ...timer,
              status: 'completed',
              targetTimestamp: null,
              currentRound: nextRound,
              isWorkPhase: false,
            },
          });
          return;
        }
        
        // Determine duration for next phase
        const durationMs = nextIsWorkPhase 
          ? timer.intervalConfig.workMs 
          : timer.intervalConfig.restMs;

        const now = Date.now();
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
          },
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
      partialize: (state) => ({
        // Only persist configuration, not runtime state
        timer: {
          ...state.timer,
          status: 'idle' as TimerStatus,
          targetTimestamp: null,
          pausedAt: null,
        },
      }),
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
