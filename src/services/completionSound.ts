import type { AppSettings, TimerState } from '../types';

export type CompletionSoundId = 'gentle-chime' | 'digital-beep' | 'soft-gong';

export interface CompletionSoundOption {
  id: CompletionSoundId;
  name: string;
}

export const COMPLETION_SOUND_OPTIONS: readonly CompletionSoundOption[] = [
  { id: 'gentle-chime', name: 'Gentle Chime' },
  { id: 'digital-beep', name: 'Digital Beep' },
  { id: 'soft-gong', name: 'Soft Gong' },
];

export const DEFAULT_COMPLETION_SOUND: CompletionSoundId = 'gentle-chime';

export function isCompletionSoundId(value: unknown): value is CompletionSoundId {
  return COMPLETION_SOUND_OPTIONS.some((option) => option.id === value);
}

export function resolveCompletionSoundId(value: unknown): CompletionSoundId {
  return isCompletionSoundId(value) ? value : DEFAULT_COMPLETION_SOUND;
}

export function completionSoundName(value: unknown): string {
  const id = resolveCompletionSoundId(value);
  return COMPLETION_SOUND_OPTIONS.find((option) => option.id === id)?.name ?? id;
}

type SoundDecisionTimer = Pick<TimerState, 'mode' | 'status'>;
type SoundDecisionSettings = Pick<AppSettings, 'soundEnabled'>;

export function shouldPlayCompletionSound(
  timer: SoundDecisionTimer,
  settings: SoundDecisionSettings
): boolean {
  if (settings.soundEnabled !== true) return false;
  if (timer.mode === 'countup') return false;
  return timer.status === 'running';
}

export type CompletionSoundPlayer = (sound: CompletionSoundId) => void | Promise<void>;

let player: CompletionSoundPlayer | null = null;
let suppressDepth = 0;

export function setCompletionSoundPlayer(next: CompletionSoundPlayer | null): void {
  player = next;
}

export function getCompletionSoundPlayer(): CompletionSoundPlayer | null {
  return player;
}

export function withoutCompletionSound<T>(run: () => T): T {
  suppressDepth += 1;
  try {
    return run();
  } finally {
    suppressDepth -= 1;
  }
}

export function playCompletionSound(
  timer: SoundDecisionTimer,
  settings: Pick<AppSettings, 'soundEnabled' | 'completionSound'>
): boolean {
  if (suppressDepth > 0) return false;
  if (!shouldPlayCompletionSound(timer, settings)) return false;
  if (player === null) return false;

  const sound = resolveCompletionSoundId(settings.completionSound);
  try {
    const result = player(sound);
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      void result.then(undefined, () => {});
    }
    return true;
  } catch {
    return false;
  }
}
