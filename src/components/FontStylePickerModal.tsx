import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import { PickerModalShell } from './PickerModalShell';
import { PressableScale } from './PressableScale';
import { spacing, typography, borderRadius, fontOptions } from '../theme/colors';
import type { FontFamily } from '../types';

interface FontStylePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal font-style picker. Each option previews with its actual registered
 * typeface (numbers + words), so comparison is WYSIWYG. Selection applies
 * instantly to global typography and persists via updateSettings.
 */
export const FontStylePickerModal: React.FC<FontStylePickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, accentColor, typeface } = useTheme();
  const fontId = useSettingsStore((state) => state.settings.fontFamily as FontFamily);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);

  const handleSelect = (id: FontFamily) => {
    if (id === fontId) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    updateSettings({ fontFamily: id });
  };

  return (
    <PickerModalShell visible={visible} title="Font Style" onClose={onClose}>
      {fontOptions.map((option) => {
        const selected = option.id === fontId;
        const previewFace = resolveTypeface(option.id, '400');
        const nameFace = resolveTypeface(option.id, '600');
        return (
          <PressableScale
            key={option.id}
            onPress={() => handleSelect(option.id)}
            accessibilityLabel={`Select font style ${option.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.row,
              {
                borderColor: selected ? accentColor : colors.border,
                backgroundColor: selected ? colors.surfaceElevated : 'transparent',
              },
            ]}
          >
            <View style={styles.textBlock}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.name,
                  {
                    color: colors.primaryText,
                    fontSize: typography.fontSizes.md,
                    fontFamily: nameFace,
                  },
                ]}
              >
                {option.name}
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  styles.preview,
                  {
                    color: colors.secondaryText,
                    fontSize: typography.fontSizes.xl,
                    fontFamily: previewFace,
                  },
                ]}
              >
                25:00 · Focus
              </Text>
            </View>
            {selected && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.check,
                  {
                    color: accentColor,
                    fontSize: typography.fontSizes.xl,
                    fontFamily: typeface,
                  },
                ]}
                accessibilityLabel="Selected"
              >
                ✓
              </Text>
            )}
          </PressableScale>
        );
      })}
    </PickerModalShell>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontWeight: typography.fontWeights.semibold,
  },
  preview: {
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  check: {
    fontWeight: typography.fontWeights.bold,
    marginLeft: spacing.sm,
  },
});
