import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './PressableScale';
import { spacing, typography } from '../theme/colors';

interface SettingsRowProps {
  label: string;
  value?: string | number;
  description?: string;
  /** Present = navigation row: right value + chevron, whole row pressable. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Keep this row stationary when used in the Settings screen. */
  disableScale?: boolean;
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
  description,
  onPress,
  accessibilityLabel,
  disableScale = false,
  showDivider = true,
}) => {
  const { colors, typeface } = useTheme();

  const content = (
    <>
      <View style={styles.labelSlot}>
      <Text
        style={[
          styles.label,
          { color: colors.primaryText, fontFamily: typeface },
        ]}
        numberOfLines={description ? 2 : 1}
      >
        {label}
      </Text>
      {description && (
        <Text
          style={[
            styles.description,
            { color: colors.secondaryText, fontFamily: typeface },
          ]}
        >
          {description}
        </Text>
      )}
      </View>

      {(value !== undefined || onPress) && (
        <View style={styles.trailing}>
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
        </View>
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

  const pressableProps = {
    onPress,
    style: [styles.container, dividerStyle],
    accessibilityLabel,
    accessibilityRole: 'button' as const,
  };

  if (disableScale) {
    return (
      <Pressable
        {...pressableProps}
        style={({ pressed }) => [styles.container, dividerStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <PressableScale {...pressableProps}>{content}</PressableScale>;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  labelSlot: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.md,
  },
  description: {
    marginTop: spacing.xs,
    fontSize: typography.fontSizes.sm,
    lineHeight: 18,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '48%',
  },
  value: {
    fontSize: typography.fontSizes.md,
    marginRight: spacing.xs,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  chevron: {
    fontSize: typography.fontSizes.xl,
    opacity: 0.5,
  },
});
