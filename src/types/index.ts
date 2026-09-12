/**
 * Timer mode types
 */
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
export type FontFamily = 'inter' | 'jetbrains-mono' | 'roboto-mono';

/**
 * Interval timer configuration
 */
export interface IntervalConfig {
  workMs: number;
  restMs: number;
  rounds: number;
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

  // Runtime state
  status: TimerStatus;
  targetTimestamp: number | null;
  pausedAt: number | null;
  elapsedTimeMs: number;
  currentRound: number;
  totalRounds: number;
  isWorkPhase: boolean;

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
  timerFontSize: number;
  animationIntensity: 'none' | 'low' | 'medium' | 'high';

  // Timer defaults
  pomodoroFocusMs: number;
  pomodoroBreakMs: number;
  countdownDurationMs: number;  // Independent countdown duration
  countdownPresetsMs: number[];
  intervalWorkMs: number;       // Independent interval work duration
  intervalRestMs: number;       // Independent interval rest duration
  intervalRounds: number;       // Independent interval rounds
  autoStartNextInterval: boolean;
  timerCompletionBehavior: 'stop' | 'repeat' | 'continue';

  // Audio
  soundEnabled: boolean;
  completionSound: string;
  ambientAudioEnabled: boolean;
  ambientAudioTrack: string | null;
  ambientAudioVolume: number;

  // Haptics
  hapticsEnabled: boolean;
  completionHapticIntensity: 'light' | 'medium' | 'heavy';

  // Display
  keepScreenAwake: boolean;
  fullscreenMode: boolean;

  // Accessibility
  reducedMotion: boolean;
  fontScale: number;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#00F5D4',
  fontFamily: 'inter',
  timerFontSize: 1,
  animationIntensity: 'low',
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
  ambientAudioEnabled: false,
  ambientAudioTrack: null,
  ambientAudioVolume: 0.5,
  hapticsEnabled: true,
  completionHapticIntensity: 'medium',
  keepScreenAwake: true,
  fullscreenMode: true,
  reducedMotion: false,
  fontScale: 1.0,
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
