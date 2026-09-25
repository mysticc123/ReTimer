/**
 * Maximum length for session labels.
 */
export const MAX_LABEL_LENGTH = 60;

/**
 * Normalizes a session label: trims whitespace, enforces max length.
 * Returns undefined for empty/whitespace-only input or undefined input.
 */
export function normalizeLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const trimmed = label.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}
export type TimerMode = 'pomodoro' | 'countdown' | 'countup' | 'interval';

/**
 * Timer status
 */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

/**
 * Theme mode
 */
export type ThemeMode = 'dark' | 'light' | 'oled';

/**
 * Font family options
 */
export type FontFamily =
  | 'inter'
  | 'jetbrains-mono'
  | 'roboto-mono'
  | 'space-mono'
  | 'oswald'
  | 'roboto';

/**
 * Interval timer configuration
 */
export interface IntervalConfig {
  workMs: number;
  restMs: number;
  rounds: number;
}

/**
 * Pomodoro timer configuration (Focus/Break cycle).
 * Captured at initialization so a running cycle is stable even if settings
 * change later. The active phase is tracked via `isWorkPhase`
 * (focus = work, break = rest) to reuse the existing phase structure.
 */
export interface PomodoroConfig {
  focusMs: number;
  breakMs: number;
  /** Long break duration (used after the configured number of focus sessions). */
  longBreakMs: number;
  /** Number of focus sessions before a long break occurs. */
  sessionsBeforeLongBreak: number;
}

/**
 * Focus-equivalent phase recorded in session history.
 * Breaks and rests complete silently (transitions only) and never record.
 */
export type FocusSessionPhase = 'focus' | 'work' | 'single';

/**
 * A completed focus session. Pure data (numbers/strings only) so it is
 * safe for JSON persistence. `actualDurationMs` equals `plannedDurationMs`
 * for every record: a phase that reaches zero delivered its full focus,
 * and pauses only shift wall-clock time (see phaseStartedAtMs tracking).
 */
export interface FocusSession {
  id: string;
  mode: 'pomodoro' | 'countdown' | 'interval';
  phase: FocusSessionPhase;
  /** 0-indexed interval round of a completed work phase. */
  round?: number;
  /** Total interval rounds of the run. */
  totalRounds?: number;
  plannedDurationMs: number;
  actualDurationMs: number;
  startedAtMs: number;
  completedAtMs: number;
  /** Optional user-defined label for this focus session. */
  label?: string;
}

/**
 * Timer configuration
 */
export interface TimerConfig {
  mode: TimerMode;
  durationMs: number;
  intervalConfig?: IntervalConfig;
}

/**
 * Timer state for runtime
 */
export interface TimerState {
  // Configuration
  mode: TimerMode;
  durationMs: number;
  intervalConfig?: IntervalConfig;
  pomodoroConfig?: PomodoroConfig;

  // Runtime state
  status: TimerStatus;
  targetTimestamp: number | null;
  pausedAt: number | null;
  elapsedTimeMs: number;
  currentRound: number;
  totalRounds: number;
  isWorkPhase: boolean;
  /**
   * Number of completed focus sessions in the current Pomodoro cycle.
   * Used to determine when to trigger a long break.
   * Persisted alongside timer state so it survives process death.
   */
  pomodoroFocusCount: number;
  /**
   * Wall-clock moment the CURRENT phase began running. Persisted alongside
   * the phase it describes so history records keep their true start across
   * process death. Nulled exactly when no phase is active (initialize,
   * reset, clear, terminal completion); never touched by pause/resume.
   */
  phaseStartedAtMs: number | null;

  // Optional user-defined label for the active timer/session.
  // Set at timer initialization, persisted alongside timer state.
  label?: string;

  // Completion callback
  onComplete?: () => void;
}

/**
 * App settings (persisted)
 */
export interface AppSettings {
  // Appearance
  theme: ThemeMode;
  accentColor: string;
  fontFamily: FontFamily;

  // Timer defaults
  pomodoroFocusMs: number;
  pomodoroBreakMs: number;
  countdownDurationMs: number;  // Independent countdown duration
  // Reserved (dormant): quick-select presets for a future Countdown presets
  // feature. Persisted but not currently read, displayed, or edited.
  countdownPresetsMs: number[];
  intervalWorkMs: number;       // Independent interval work duration
  intervalRestMs: number;       // Independent interval rest duration
  intervalRounds: number;       // Independent interval rounds
  autoStartNextInterval: boolean;
  // Countdown completion behavior (P9): 'stop' ends the timer after one
  // cycle; 'repeat' automatically starts a fresh Countdown cycle.
  // 'continue' is retained for compatibility but behaves as 'stop'.
  timerCompletionBehavior: 'stop' | 'repeat' | 'continue';

  // Audio: whether a phase completion plays a sound, and which one. The
  // decision + dispatch boundary lives in services/completionSound, driven
  // by the canonical completion transitions in the timer store.
  soundEnabled: boolean;
  completionSound: string;

  // Haptics
  hapticsEnabled: boolean;

  // Notifications (Issue #9): whether the one-time notification permission
  // prompt has already been shown. Timer works identically either way.
  notificationsAsked: boolean;

  // Display
  keepScreenAwake: boolean;
  fullscreenMode: boolean;

  // Accessibility
  reducedMotion: boolean;
  fontScale: number;

  // Goals
  dailyFocusGoalMs: number;

  // Pomodoro
  pomodoroLongBreakMs: number;
  pomodoroSessionsBeforeLongBreak: number;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#00F5D4',
  fontFamily: 'inter',
  pomodoroFocusMs: 25 * 60 * 1000,
  pomodoroBreakMs: 5 * 60 * 1000,
  countdownDurationMs: 10 * 60 * 1000,  // Default 10 minutes for countdown
  countdownPresetsMs: [
    5 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
    45 * 60 * 1000,
    60 * 60 * 1000,
  ],
  intervalWorkMs: 30 * 1000,   // Default 30 seconds work
  intervalRestMs: 10 * 1000,   // Default 10 seconds rest
  intervalRounds: 8,           // Default 8 rounds
  autoStartNextInterval: false,
  timerCompletionBehavior: 'stop',
  soundEnabled: true,
  completionSound: 'gentle-chime',
  hapticsEnabled: true,
  notificationsAsked: false,
  keepScreenAwake: true,
  fullscreenMode: true,
  reducedMotion: false,
  fontScale: 1.0,
  dailyFocusGoalMs: 2 * 60 * 60 * 1000, // Default 2 hours
  pomodoroLongBreakMs: 15 * 60 * 1000, // Default 15 minutes
  pomodoroSessionsBeforeLongBreak: 4, // Default 4 focus sessions before long break
};

/**
 * Preset durations for quick selection
 */
export const PRESET_DURATIONS = {
  pomodoro: {
    focus: 25 * 60 * 1000,
    shortBreak: 5 * 60 * 1000,
    longBreak: 15 * 60 * 1000,
  },
  countdown: [
    { label: '5 min', ms: 5 * 60 * 1000 },
    { label: '15 min', ms: 15 * 60 * 1000 },
    { label: '30 min', ms: 30 * 60 * 1000 },
    { label: '45 min', ms: 45 * 60 * 1000 },
    { label: '60 min', ms: 60 * 60 * 1000 },
  ],
  interval: {
    default: {
      workMs: 30 * 1000,
      restMs: 10 * 1000,
      rounds: 8,
    },
  },
};
