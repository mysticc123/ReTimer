import React, { useCallback } from 'react';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSettingsStore } from '../store';

const AnimatedPressable = createAnimatedComponent(Pressable);

type PressableProps = ComponentProps<typeof Pressable>;

interface PressableScaleProps {
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  delayLongPress?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityState?: PressableProps['accessibilityState'];
  accessibilityHint?: string;
  /** Scale applied while pressed. Defaults to 0.98 for all callers. */
  scaleTo?: number;
}

/**
 * Small reusable tactile press wrapper (single press-animation system).
 *
 * PRESS: snaps quickly toward `scaleTo` via withTiming (~90ms, UI thread)
 * so feedback starts immediately on touch-down.
 * RELEASE: settles back to 1.0 with a soft, restrained spring
 * (damping 16 / stiffness 160) — subtle physical feedback, no bounce.
 * pressOut always retargets 1.0, so rapid tapping can never leave the
 * element stuck below scale.
 *
 * Honors the existing `reducedMotion` setting: when enabled, no scaling occurs.
 * Transform scale never affects surrounding layout.
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  accessibilityHint,
  scaleTo = 0.98,
}) => {
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (reduceMotion || disabled) return;
    scale.value = withTiming(scaleTo, { duration: 90 });
  }, [reduceMotion, disabled, scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion || disabled) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, { damping: 16, stiffness: 160 });
  }, [reduceMotion, disabled, scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityHint={accessibilityHint}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
