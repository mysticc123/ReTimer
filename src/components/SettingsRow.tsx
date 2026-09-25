import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './PressableScale';
import { spacing, typography } from '../theme/colors';

interface SettingsRowProps {
  label: string;
  value?: string | number;
  /** Present = navigation row: right value + chevron, whole row pressable. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Drop the bottom divider (last row in a card). Defaults to true. */
  showDivider?: boolean;
}

/**
 * Single settings row for navigation / value display (theme, accent, font,
 * durations, status rows). Booleans use SettingsSwitchRow instead.
 * A row without `onPress` renders statically (e.g. a status row).
 */
export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  value,
  onPress,
  accessibilityLabel,
  showDivider = true,
}) => {
  const { colors, typeface } = useTheme();

  const content = (
    <>
      <Text
        style={[
          styles.label,
          { color: colors.primaryText, fontFamily: typeface },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {value !== undefined && (
        <Text
          style={[
            styles.value,
            { color: colors.secondaryText, fontFamily: typeface },
          ]}
        >
          {String(value)}
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

  const dividerStyle = showDivider
    ? { borderBottomWidth: 1, borderBottomColor: colors.border }
    : null;

  if (!onPress) {
    return (
      <View style={[styles.container, dividerStyle]} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.container, dividerStyle]}
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.md,
    // Pin the value/chevron right without ever collapsing the label: a long
    // value wraps instead, keeping short rows unchanged.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  value: {
    fontSize: typography.fontSizes.md,
    marginRight: spacing.xs,
    flexShrink: 1,
    textAlign: 'right' as const,
    maxWidth: '60%',
  },
  chevron: {
    fontSize: typography.fontSizes.xl,
    opacity: 0.5,
  },
});