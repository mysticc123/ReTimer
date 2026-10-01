import type { TimerState } from '../types';

/**
 * Derives the Active Timer display from the persisted timer snapshot.
 * Running timers use their timestamp anchor; paused/idle timers use the
 * frozen elapsed value. This keeps remounts from falling back to the original
 * configured duration.
 */
export function getActiveTimerDisplayTime(timer: TimerState, now: number = Date.now()): number {
  if (timer.mode === 'countup') {
    if (timer.status === 'running' && timer.targetTimestamp !== null) {
      return Math.max(0, now - timer.targetTimestamp);
    }
    return Math.max(0, timer.elapsedTimeMs);
  }

  if (timer.status === 'completed') {
    return 0;
  }

  if (timer.status === 'running' && timer.targetTimestamp !== null) {
    return Math.max(0, timer.targetTimestamp - now);
  }

  return Math.max(0, timer.durationMs - timer.elapsedTimeMs);
}
