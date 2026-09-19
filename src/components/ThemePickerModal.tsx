import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store';
import { PickerModalShell } from './PickerModalShell';
import { PressableScale } from './PressableScale';
import { spacing, typography, borderRadius, themeOptions, getThemeColors } from '../theme/colors';
import type { ThemeMode } from '../types';

interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal theme picker on the shared PickerModalShell. Selection applies
 * instantly to the global theme (single Zustand source) and persists via
 * updateSettings; the picker stays open for comparison. Other preferences
 * (accent, font, scale) are untouched by partial updates.
 */
export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, accentColor, typeface } = useTheme();
  const theme = useSettingsStore((state) => state.settings.theme as ThemeMode);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);

  const handleSelect = (id: ThemeMode) => {
    if (id === theme) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    updateSettings({ theme: id });
  };

  return (
    <PickerModalShell visible={visible} title="Theme" onClose={onClose}>
      {themeOptions.map((option) => {
        const selected = option.id === theme;
        return (
          <PressableScale
            key={option.id}
            onPress={() => handleSelect(option.id)}
            accessibilityLabel={`Select theme ${option.name}`}
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
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: getThemeColors(option.id).background,
                  borderColor: selected ? '#FFFFFF' : colors.border,
                },
              ]}
            />
            <View style={styles.textBlock}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.name,
                  {
                    color: colors.primaryText,
                    fontSize: typography.fontSizes.md,
                    fontFamily: typeface,
                  },
                ]}
              >
                {option.name}
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
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    marginRight: spacing.md,
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontWeight: typography.fontWeights.medium,
  },
  check: {
    fontWeight: typography.fontWeights.bold,
    marginLeft: spacing.sm,
  },
});
