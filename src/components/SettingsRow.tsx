import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './PressableScale';
import { spacing, typography } from '../theme/colors';

interface SettingsRowProps {
  label: string;
  value?: string | number | boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  value,
  onPress,
  accessibilityLabel,
}) => {
  const { colors, typeface } = useTheme();

  const content = (
    <>
      <Text style={[styles.label, { color: colors.primaryText, fontFamily: typeface }]}>
        {label}
      </Text>

      {value !== undefined && (
        <Text style={[styles.value, { color: colors.secondaryText, fontFamily: typeface }]}>
          {typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value)}
        </Text>
      )}

      {onPress && (
        <Text
          style={[
            styles.chevron,
            { color: colors.secondaryText, fontFamily: typeface },
          ]}
        >
          ›
        </Text>
      )}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.container,
          { borderBottomColor: colors.border },
        ]}
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.container,
        { borderBottomColor: colors.border },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {content}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: typography.fontSizes.md,
    flex: 1,
  },
  value: {
    fontSize: typography.fontSizes.md,
    marginRight: spacing.sm,
  },
  chevron: {
    fontSize: typography.fontSizes.xl,
    opacity: 0.5,
  },
});
