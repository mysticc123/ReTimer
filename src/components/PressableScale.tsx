import React, { useCallback, useMemo } from 'react';
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
import { useTheme } from '../theme';

const AnimatedPressable = createAnimatedComponent(Pressable);

type PressableProps = ComponentProps<typeof Pressable>;

/**
 * Restrained Android press tint. RN only installs a ripple when `android_ripple`
 * is set, so without it every pressable falls back to the platform's default
 * `colorHighlight` — a near-white overlay that flashes hard on the dark/OLED
 * surfaces. A low-alpha overlay of the opposite luminance keeps the press
 * legible in both themes without a bright flash. `borderless: false` keeps the
 * ripple inside the control; `foreground: true` draws it above the row's own
 * children (switch, chevron, value).
 */
const DARK_TINT = 'rgba(255, 255, 255, 0.10)';
const LIGHT_TINT = 'rgba(0, 0, 0, 0.10)';

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
 *
 * TOUCH TINT: every caller also gets the shared `androidRipple`, which replaces
 * the platform's bright default press highlight with a theme-aware, low-alpha
 * tint. It is not an animation, so reduced motion still gets press feedback
 * (and only the scale animation is suppressed).
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
}) => {
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const { isDark } = useTheme();
  const scale = useSharedValue(1);

  const androidRipple = useMemo(
    () => ({
      color: isDark ? DARK_TINT : LIGHT_TINT,
      borderless: false,
      foreground: true,
    }),
    [isDark]
  );

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
      hitSlop={hitSlop}
      android_ripple={androidRipple}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
