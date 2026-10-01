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
  /**
   * Expands the tappable area beyond the visible bounds without changing
   * layout (e.g. `{ top: 12, bottom: 12, left: 12, right: 12 }`).
   * Use for text-only controls whose visible size is below the 48dp
   * Android touch target. Defaults to none for all callers.
   */
  hitSlop?: PressableProps['hitSlop'];
  /** Scale applied while pressed. Defaults to 0.98 for all callers. */
  scaleTo?: number;
  /** Opt into a deliberately shaped Android ripple for this surface. */
  androidRipple?: PressableProps['android_ripple'] | null;
}

/**
 * Small reusable tactile press wrapper (single press-animation system).
 *
 * PRESS: snaps quickly toward `scaleTo` via withTiming (~70ms, UI thread)
 * so feedback starts immediately on touch-down.
 * RELEASE: settles back to 1.0 with a soft, restrained spring
 * (damping 16 / stiffness 160) — subtle physical feedback, no bounce.
 * pressOut always retargets 1.0, so rapid tapping can never leave the
 * element stuck below scale.
 *
 * Transform scale never affects surrounding layout.
 *
 * TOUCH FEEDBACK: compact controls use the scale feedback only by default.
 * Native ripples are opt-in because Android's unbounded rectangular foreground
 * treatment is not shape-safe for text/icon controls. Surfaces with an
 * explicit geometry may pass a shaped `androidRipple` when appropriate.
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
  hitSlop,
  scaleTo = 0.98,
  androidRipple: androidRippleOverride,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withTiming(scaleTo, { duration: 70 });
  }, [disabled, scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    if (disabled) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, { damping: 16, stiffness: 160 });
  }, [disabled, scale]);

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
      hitSlop={hitSlop}
      android_ripple={androidRippleOverride ?? undefined}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
