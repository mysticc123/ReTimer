import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store';
import { PickerModalShell } from './PickerModalShell';
import { PressableScale } from './PressableScale';
import { spacing, typography, borderRadius } from '../theme/colors';
import { COMPLETION_SOUND_OPTIONS, resolveCompletionSoundId } from '../services/completionSound';
import type { CompletionSoundId } from '../services/completionSound';

interface CompletionSoundPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

const SOUND_DESCRIPTIONS: Record<CompletionSoundId, string> = {
  'gentle-chime': 'Soft rising chime',
  'digital-beep': 'Short crisp beep',
  'soft-gong': 'Low sustained tone',
};

export const CompletionSoundPickerModal: React.FC<CompletionSoundPickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, accentColor, typeface } = useTheme();
  const completionSound = useSettingsStore((state) => state.settings.completionSound);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);

  const selectedId = resolveCompletionSoundId(completionSound);

  const handleSelect = (id: CompletionSoundId) => {
    if (id === selectedId) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    updateSettings({ completionSound: id });
  };

  return (
    <PickerModalShell visible={visible} title="Completion Sound" onClose={onClose}>
      {COMPLETION_SOUND_OPTIONS.map((option) => {
        const selected = option.id === selectedId;
        return (
          <PressableScale
            key={option.id}
            onPress={() => handleSelect(option.id)}
            accessibilityLabel={`Select completion sound ${option.name}`}
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
                    fontFamily: typeface,
                  },
                ]}
              >
                {option.name}
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  styles.description,
                  {
                    color: colors.secondaryText,
                    fontSize: typography.fontSizes.sm,
                    fontFamily: typeface,
                  },
                ]}
              >
                {SOUND_DESCRIPTIONS[option.id]}
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
    fontWeight: typography.fontWeights.medium,
  },
  description: {
    marginTop: 2,
  },
  check: {
    fontWeight: typography.fontWeights.bold,
    marginLeft: spacing.sm,
  },
});
