import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import { WheelNumberPicker } from './WheelNumberPicker';
import { EditorModalShell } from './EditorModalShell';
import { spacing, typography } from '../theme/colors';
import { formatDurationShort, formatTwoDigits } from '../utils/durationFormat';

export const WHEEL_MINUTES_MIN = 0;
export const WHEEL_MINUTES_MAX = 99;
export const WHEEL_SECONDS_MIN = 0;
export const WHEEL_SECONDS_MAX = 59;
export const DEFAULT_MIN_TOTAL_MS = 1000;
export const DEFAULT_MAX_TOTAL_MS = (99 * 60 + 59) * 1000;

interface DurationEditorModalProps {
  visible: boolean;
  /** e.g. "Focus duration" */
  title: string;
  /** Current stored value, used to pre-fill when the editor opens. */
  initialMs: number;
  /** Smallest total duration accepted. Defaults to 1 second. */
  minTotalMs?: number;
  /** Largest total duration accepted. Defaults to 99:59. */
  maxTotalMs?: number;
  /**
   * Largest minutes value on the wheel. Defaults to 99; raise it when
   * maxTotalMs exceeds 99 minutes (e.g. Countdown up to 120 minutes) so
   * every valid stored value stays reachable and is never clamped away.
   */
  minutesMax?: number;
  onSave: (durationMs: number) => void;
  onCancel: () => void;
}

/**
 * Split milliseconds into whole minutes/seconds for the editor wheels.
 * Exported for reuse/testing.
 */
export function splitDurationMs(durationMs: number): { minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Validate numeric minutes/seconds against the allowed total range.
 * Returns the error message, or null when the draft is valid.
 * Exported for reuse/testing.
 */
export function validateDurationValues(
  minutes: number,
  seconds: number,
  minTotalMs: number = DEFAULT_MIN_TOTAL_MS,
  maxTotalMs: number = DEFAULT_MAX_TOTAL_MS,
  minutesMax: number = WHEEL_MINUTES_MAX
): string | null {
  if (minutes < WHEEL_MINUTES_MIN || minutes > minutesMax) {
    return `Minutes must be ${WHEEL_MINUTES_MIN}–${minutesMax}.`;
  }
  if (seconds < WHEEL_SECONDS_MIN || seconds > WHEEL_SECONDS_MAX) {
    return `Seconds must be ${WHEEL_SECONDS_MIN}–${WHEEL_SECONDS_MAX}.`;
  }
  const totalMs = (minutes * 60 + seconds) * 1000;
  if (totalMs <= 0 || totalMs < minTotalMs) {
    return minTotalMs <= 1000
      ? 'Duration must be greater than zero.'
      : `Duration must be at least ${formatDurationShort(minTotalMs)}.`;
  }
  if (totalMs > maxTotalMs) {
    return `Duration must be at most ${formatDurationShort(maxTotalMs)}.`;
  }
  return null;
}

/**
 * Reusable MM:SS duration editor backed by scrollable wheel pickers.
 *
 * Opens pre-filled from `initialMs`; writes nothing until Save passes
 * validation. Cancel (or backdrop/Back press) discards the draft.
 */
export const DurationEditorModal: React.FC<DurationEditorModalProps> = ({
  visible,
  title,
  initialMs,
  minTotalMs = DEFAULT_MIN_TOTAL_MS,
  maxTotalMs = DEFAULT_MAX_TOTAL_MS,
  minutesMax = WHEEL_MINUTES_MAX,
  onSave,
  onCancel,
}) => {
  const { colors, fontFamily } = useTheme();
  const fontScale = useSettingsStore((state) => state.settings.fontScale);

  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);

  // Pre-fill the draft from the stored value every time the editor opens.
  useEffect(() => {
    if (visible) {
      const parts = splitDurationMs(initialMs);
      setMinutes(Math.max(WHEEL_MINUTES_MIN, Math.min(minutesMax, parts.minutes)));
      setSeconds(Math.max(WHEEL_SECONDS_MIN, Math.min(WHEEL_SECONDS_MAX, parts.seconds)));
    }
  }, [visible, initialMs, minutesMax]);

  const totalMs = (minutes * 60 + seconds) * 1000;
  const validationError = validateDurationValues(minutes, seconds, minTotalMs, maxTotalMs, minutesMax);

  return (
    <EditorModalShell
      visible={visible}
      title={title}
      error={validationError}
      saveDisabled={validationError !== null}
      onSave={() => onSave(totalMs)}
      onCancel={onCancel}
    >
      {/* Remount the wheels on every open so the initial scroll position
          always matches the stored value (no jump from a previous session). */}
      <View key={visible ? `open-${initialMs}` : 'closed'} style={styles.wheelsRow}>
        <View style={styles.wheelColumn}>
          <Text
            style={[
              styles.wheelLabel,
              {
                color: colors.secondaryText,
                fontSize: typography.fontSizes.sm * fontScale,
                fontFamily: resolveTypeface(fontFamily, '500'),
              },
            ]}
          >
            Minutes
          </Text>
          <WheelNumberPicker
            label="Minutes"
            value={minutes}
            min={WHEEL_MINUTES_MIN}
            max={minutesMax}
            onChange={setMinutes}
            formatValue={formatTwoDigits}
          />
        </View>

          <Text
            style={[
              styles.colon,
              {
                color: colors.secondaryText,
                fontSize: typography.fontSizes.xxl * fontScale,
                fontFamily: resolveTypeface(fontFamily, '400'),
              },
            ]}
          >
            :
          </Text>

        <View style={styles.wheelColumn}>
          <Text
            style={[
              styles.wheelLabel,
              {
                color: colors.secondaryText,
                fontSize: typography.fontSizes.sm * fontScale,
                fontFamily: resolveTypeface(fontFamily, '500'),
              },
            ]}
          >
            Seconds
          </Text>
          <WheelNumberPicker
            label="Seconds"
            value={seconds}
            min={WHEEL_SECONDS_MIN}
            max={WHEEL_SECONDS_MAX}
            onChange={setSeconds}
            formatValue={formatTwoDigits}
          />
        </View>
      </View>
    </EditorModalShell>
  );
};

const styles = StyleSheet.create({
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wheelColumn: {
    alignItems: 'center',
  },
  wheelLabel: {
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
  },
  colon: {
    fontWeight: typography.fontWeights.bold,
    marginHorizontal: spacing.sm,
    paddingTop: 26,
  },
});
