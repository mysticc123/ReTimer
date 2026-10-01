import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TimerState } from '../src/types';
import { getActiveTimerDisplayTime } from '../src/utils/activeTimerDisplay';

const NOW = 1_700_000_000_000;

function timer(overrides: Partial<TimerState> = {}): TimerState {
  return {
    mode: 'countdown',
    durationMs: 15_000,
    status: 'idle',
    targetTimestamp: null,
    pausedAt: null,
    elapsedTimeMs: 0,
    currentRound: 0,
    totalRounds: 1,
    isWorkPhase: true,
    pomodoroFocusCount: 0,
    phaseStartedAtMs: null,
    ...overrides,
  };
}

describe('Active Timer display synchronization', () => {
  it('shows the persisted remaining time for a paused countdown on remount', () => {
    assert.equal(
      getActiveTimerDisplayTime(timer({ status: 'paused', elapsedTimeMs: 3_000 }), NOW),
      12_000
    );
  });

  it('derives the current remaining time for a running countdown', () => {
    assert.equal(
      getActiveTimerDisplayTime(
        timer({ status: 'running', targetTimestamp: NOW + 12_000 }),
        NOW
      ),
      12_000
    );
  });

  it('reset state returns to the configured duration', () => {
    assert.equal(getActiveTimerDisplayTime(timer(), NOW), 15_000);
  });

  it('keeps count-up remount display synchronized for running and paused states', () => {
    assert.equal(
      getActiveTimerDisplayTime(
        timer({ mode: 'countup', status: 'running', targetTimestamp: NOW - 12_000 }),
        NOW
      ),
      12_000
    );
    assert.equal(
      getActiveTimerDisplayTime(timer({ mode: 'countup', status: 'paused', elapsedTimeMs: 12_000 }), NOW),
      12_000
    );
  });

  it('completed countdown displays zero without changing timer state', () => {
    assert.equal(getActiveTimerDisplayTime(timer({ status: 'completed', elapsedTimeMs: 15_000 }), NOW), 0);
  });
});
