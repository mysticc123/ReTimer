import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSettingsStore } from '../store';
import { useTheme, resolveTypeface } from '../theme';
import { spacing, typography, borderRadius } from '../theme/colors';
import { FONT_SCALES } from '../utils/fontScale';

interface SteppedFontScaleSliderProps {
  /** Current persisted fontScale multiplier. */
  value: number;
  /** Called with the exact snapped step value (always a FONT_SCALES member). */
  onChange: (value: number) => void;
}

const DOT_SIZE = 8;
const THUMB_SIZE = 26;
const TRACK_HEIGHT = 44;
const LINE_HEIGHT = 4;
// Horizontal inset aligning dot centers with thumb travel bounds.
const EDGE_INSET = (THUMB_SIZE - DOT_SIZE) / 2;

interface StepDotProps {
  index: number;
  /** Single source of truth: the thumb's live track position (px). */
  position: SharedValue<number>;
  /** Usable travel in px (track width minus thumb size). */
  travel: number;
  count: number;
  activeColor: string;
  inactiveColor: string;
}

/**
 * One step dot. Its highlight derives exclusively from the thumb's shared
 * position on the UI thread, so the glowing dot and the thumb can never
 * disagree — during drags, flings, taps, and snap animations alike.
 */
const StepDot: React.FC<StepDotProps> = ({
  index,
  position,
  travel,
  count,
  activeColor,
  inactiveColor,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const stepPos =
      travel <= 0 ? 0 : (position.value / travel) * (count - 1);
    const closeness = Math.max(0, 1 - Math.abs(stepPos - index));
    return {
      backgroundColor: interpolateColor(
        closeness,
        [0, 1],
        [inactiveColor, activeColor]
      ),
      opacity: 0.35 + 0.65 * closeness,
      transform: [{ scale: 1 + 0.25 * closeness }],
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

/**
 * Stepped font-scale slider: pill container, small/big "A" anchors,
 * one dot per FONT_SCALES level, accent thumb snapped to the active dot.
 *
 * Gesture model (PanResponder, no extra deps): drag follows the finger via
 * a shared value; crossing a step boundary commits that exact step through
 * `onChange` (bounded writes, live typography); release/tap snaps the thumb
 * to the nearest step. Geometry uses fixed sizes so changing the global
 * fontScale never destabilizes the control itself.
 */
export const SteppedFontScaleSlider: React.FC<SteppedFontScaleSliderProps> = ({
  value,
  onChange,
}) => {
  const { colors, accentColor, fontFamily } = useTheme();
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);

  const steps = useMemo(() => [...FONT_SCALES], []);
  const count = steps.length;

  const nearestIndex = (scale: number): number => {
    let best = 0;
    let bestDist = Math.abs(steps[0] - scale);
    for (let i = 1; i < count; i++) {
      const dist = Math.abs(steps[i] - scale);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useSharedValue(0);
  const draggingRef = useRef(false);
  const snappingRef = useRef(false);
  const committedRef = useRef(nearestIndex(value));

  const travel = Math.max(0, trackWidth - THUMB_SIZE);
  const posForIndex = (index: number): number =>
    travel <= 0 ? 0 : (index / (count - 1)) * travel;
  const indexForX = (x: number): number => {
    if (travel <= 0) return committedRef.current;
    const t = Math.max(0, Math.min(1, (x - EDGE_INSET - DOT_SIZE / 2) / travel));
    return Math.round(t * (count - 1));
  };

  const commitIndex = (index: number) => {
    if (index !== committedRef.current) {
      committedRef.current = index;
      onChange(steps[index]);
    }
  };

  const endSnap = () => {
    snappingRef.current = false;
  };

  const snapToIndex = (index: number, animated: boolean) => {
    const target = posForIndex(index);
    if (animated && !reduceMotion) {
      snappingRef.current = true;
      thumbX.value = withTiming(target, { duration: 140 }, (finished) => {
        if (finished) runOnJS(endSnap)();
      });
    } else {
      snappingRef.current = false;
      thumbX.value = target;
    }
  };

  // Mirror external value changes (e.g. remount with persisted value) without
  // fighting an active drag or snap animation, and never writing back.
  if (!draggingRef.current && !snappingRef.current && trackWidth > 0) {
    const synced = posForIndex(nearestIndex(value));
    if (Math.abs(thumbX.value - synced) > 0.5) {
      thumbX.value = synced;
      committedRef.current = nearestIndex(value);
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          if (trackWidth <= 0) return;
          draggingRef.current = true;
          snappingRef.current = false;
          const x = event.nativeEvent.locationX;
          thumbX.value = Math.max(0, Math.min(travel, x - THUMB_SIZE / 2));
        },
        onPanResponderMove: (event) => {
          if (trackWidth <= 0) return;
          const x = event.nativeEvent.locationX;
          thumbX.value = Math.max(0, Math.min(travel, x - THUMB_SIZE / 2));
          commitIndex(indexForX(x));
        },
        onPanResponderRelease: (event) => {
          draggingRef.current = false;
          if (trackWidth <= 0) return;
          const index = indexForX(event.nativeEvent.locationX);
          commitIndex(index);
          snapToIndex(index, true);
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          snapToIndex(committedRef.current, true);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackWidth, travel, reduceMotion, onChange]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  const activeIndex = nearestIndex(value);
  const typeface = resolveTypeface(fontFamily, '400');
  const typefaceBold = resolveTypeface(fontFamily, '700');

  return (
    <View
      style={[styles.pill, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      accessibilityLabel="Text size"
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: 0,
        max: count - 1,
        now: activeIndex,
        text: `${Math.round(value * 100)} percent`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const next =
          event.nativeEvent.actionName === 'increment'
            ? Math.min(count - 1, activeIndex + 1)
            : Math.max(0, activeIndex - 1);
        commitIndex(next);
        snapToIndex(next, true);
      }}
    >
      <Text style={[styles.anchorSmall, { color: colors.secondaryText, fontFamily: typeface }]}>
        A
      </Text>

      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        {trackWidth > 0 && (
          <>
            <View
              // Overlay chrome must never become the touch target: on Android
              // locationX is reported relative to the deepest view under the
              // finger, which would corrupt the track-relative index math.
              pointerEvents="none"
              style={[
                styles.line,
                {
                  left: EDGE_INSET + DOT_SIZE / 2,
                  right: EDGE_INSET + DOT_SIZE / 2,
                  backgroundColor: colors.border,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[styles.dots, { paddingHorizontal: EDGE_INSET }]}
            >
              {steps.map((step, index) => (
                <StepDot
                  key={step}
                  index={index}
                  position={thumbX}
                  travel={travel}
                  count={count}
                  activeColor={accentColor}
                  inactiveColor={colors.secondaryText}
                />
              ))}
            </View>
            <Animated.View
              // Same coordinate-space guarantee as the line/dots above:
              // the track container must always be the touch target.
              pointerEvents="none"
              style={[
                styles.thumb,
                { backgroundColor: accentColor, borderColor: colors.background },
                thumbStyle,
              ]}
            />
          </>
        )}
      </View>

      <Text style={[styles.anchorBig, { color: colors.primaryText, fontFamily: typefaceBold }]}>
        A
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  anchorSmall: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.regular,
    marginRight: spacing.sm,
  },
  anchorBig: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginLeft: spacing.sm,
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    top: (TRACK_HEIGHT - LINE_HEIGHT) / 2,
    height: LINE_HEIGHT,
    borderRadius: LINE_HEIGHT / 2,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
  },
});
