import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/**
 * Shared modal entry-scale (single source; used by PickerModalShell and
 * EditorModalShell so both animate identically).
 *
 * On open: starts at 0.9 and springs to 1.0 (damping 14 / stiffness 240 —
 * a restrained settle matching the press-spring family). Opacity is handled
 * by the shell's existing FadeIn entering prop on the same node, so the two
 * properties never fight over one transform.
 *
 * Exit scale is intentionally omitted: React Native Modal unmount timing
 * makes exit transforms unreliable, and the existing FadeOut already covers
 * dismissal. Honors reducedMotion by holding scale at 1.0.
 */
export function useModalEnterScale(active: boolean, reduceMotion: boolean) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!reduceMotion && active) {
      scale.value = 0.9;
      scale.value = withSpring(1, { damping: 14, stiffness: 240 });
    } else {
      scale.value = 1;
    }
  }, [active, reduceMotion, scale]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
}
