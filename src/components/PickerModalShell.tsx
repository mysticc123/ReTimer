import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store';
import { useModalEnterScale } from './useModalEnterScale';
import { spacing, typography, borderRadius } from '../theme/colors';

interface PickerModalShellProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Shared shell for instant-apply selection pickers (theme, accent color,
 * font style). Same backdrop/card/motion language as EditorModalShell, but
 * with a scrollable option list and no Save/Cancel: tapping an option
 * applies it immediately, backdrop/Back dismisses.
 *
 * The card shares one maxHeight across all three pickers so tall option
 * lists (fonts, accents) scroll inside a bounded frame instead of growing
 * it, while short lists (theme) render compactly and never scroll.
 */
export const PickerModalShell: React.FC<PickerModalShellProps> = ({
  visible,
  title,
  onClose,
  children,
}) => {
  const { colors, typeface } = useTheme();
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const enterScaleStyle = useModalEnterScale(visible, reduceMotion);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(150)}
        exiting={reduceMotion ? undefined : FadeOut.duration(150)}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.backdropPress}
          onPress={onClose}
          accessibilityLabel={`Close ${title} picker`}
          accessibilityRole="button"
        />
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(150)}
          exiting={reduceMotion ? undefined : FadeOut.duration(150)}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
            enterScaleStyle,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.title,
              {
                color: colors.primaryText,
                fontSize: typography.fontSizes.lg,
                fontFamily: typeface,
              },
            ]}
          >
            {title}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdropPress: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '85%',
    maxWidth: 340,
    // Single shared bound for all pickers: short lists (theme) render
    // compactly below it, tall lists (fonts, accents) clamp here and scroll
    // inside instead of growing the frame. ~5 option rows visible on tall
    // screens; small screens and landscape clamp further but keep the
    // ~440px theme content unclamped on all but the shortest viewports.
    maxHeight: '50%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  title: {
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  list: {
    // NOTE: flexGrow (NOT flex: 1) — flexBasis must stay auto so short
    // content still sizes the list. When the card hits maxHeight, the grown
    // list fills the remaining card space and scrolls instead of growing it.
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
