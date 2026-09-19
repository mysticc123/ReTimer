import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import { PressableScale } from './PressableScale';
import { useModalEnterScale } from './useModalEnterScale';
import { spacing, typography, borderRadius } from '../theme/colors';

interface EditorModalShellProps {
  visible: boolean;
  title: string;
  /** Validation message, or null when the draft is valid. */
  error: string | null;
  saveDisabled: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal chrome for the timer configuration editors
 * (duration editor, rounds editor): backdrop, card, title, error slot,
 * and Cancel/Save actions with the existing motion language.
 * Save fires a light haptic (when enabled) before delegating.
 */
export const EditorModalShell: React.FC<EditorModalShellProps> = ({
  visible,
  title,
  error,
  saveDisabled,
  onSave,
  onCancel,
  children,
}) => {
  const { colors, accentColor, fontFamily, typeface } = useTheme();
  const fontScale = useSettingsStore((state) => state.settings.fontScale);
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);
  const enterScaleStyle = useModalEnterScale(visible, reduceMotion);

  const handleSave = () => {
    if (saveDisabled) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onSave();
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(150)}
        exiting={reduceMotion ? undefined : FadeOut.duration(150)}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.backdropPress}
          onPress={onCancel}
          accessibilityLabel="Cancel without saving"
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
            style={[
              styles.title,
              {
                color: colors.primaryText,
                fontSize: typography.fontSizes.lg * fontScale,
                fontFamily: resolveTypeface(fontFamily, '600'),
              },
            ]}
          >
            {title}
          </Text>

          {children}

          <View style={styles.errorSlot}>
            {error && (
              <Text
                style={[
                  styles.errorText,
                  { fontSize: typography.fontSizes.sm * fontScale, fontFamily: typeface },
                ]}
                accessibilityRole="alert"
              >
                {error}
              </Text>
            )}
          </View>

          <View style={styles.buttonsRow}>
            <PressableScale
              onPress={onCancel}
              accessibilityLabel="Cancel without saving"
              accessibilityRole="button"
              style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: colors.secondaryText,
                    fontSize: typography.fontSizes.md * fontScale,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                  },
                ]}
              >
                Cancel
              </Text>
            </PressableScale>

            <PressableScale
              onPress={handleSave}
              accessibilityLabel={`Save ${title}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: saveDisabled }}
              style={[
                styles.button,
                { backgroundColor: accentColor, opacity: saveDisabled ? 0.5 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.saveButtonText,
                  {
                    fontSize: typography.fontSizes.md * fontScale,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                  },
                ]}
              >
                Save
              </Text>
            </PressableScale>
          </View>
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
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  title: {
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorSlot: {
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: typography.fontWeights.semibold,
  },
  saveButtonText: {
    color: '#000000',
  },
});
