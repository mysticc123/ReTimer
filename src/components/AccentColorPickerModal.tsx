import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store';
import { PickerModalShell } from './PickerModalShell';
import { PressableScale } from './PressableScale';
import { spacing, typography, borderRadius, accentOptions } from '../theme/colors';

interface AccentColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal accent-color picker. Selection applies instantly to the global
 * theme (single Zustand source) and persists via updateSettings;
 * the picker stays open for further comparison.
 */
export const AccentColorPickerModal: React.FC<AccentColorPickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, typeface } = useTheme();
  const accentColor = useSettingsStore((state) => state.settings.accentColor);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);

  const handleSelect = (value: string) => {
    if (value === accentColor) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    updateSettings({ accentColor: value });
  };

  return (
    <PickerModalShell visible={visible} title="Accent Color" onClose={onClose}>
      {accentOptions.map((option) => {
        const selected = option.value === accentColor;
        return (
          <PressableScale
            key={option.id}
            onPress={() => handleSelect(option.value)}
            accessibilityLabel={`Select accent color ${option.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.row,
              {
                borderColor: selected ? option.value : colors.border,
                backgroundColor: selected ? colors.surfaceElevated : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: option.value,
                  borderColor: selected ? '#FFFFFF' : 'transparent',
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
              <Text
                allowFontScaling={false}
                style={[
                  styles.hex,
                  {
                    color: colors.secondaryText,
                    fontSize: typography.fontSizes.sm,
                    fontFamily: typeface,
                  },
                ]}
              >
                {option.value}
              </Text>
            </View>
            {selected && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.check,
                  {
                    color: option.value,
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
  hex: {
    marginTop: 2,
  },
  check: {
    fontWeight: typography.fontWeights.bold,
    marginLeft: spacing.sm,
  },
});
