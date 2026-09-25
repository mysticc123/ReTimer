import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './PressableScale';
import { spacing, typography } from '../theme/colors';

interface SettingsSwitchRowProps {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
  /** Drop the bottom divider (last row in a card). Defaults to true. */
  showDivider?: boolean;
}

/**
 * Native-feeling toggle row: label left, React Native's native `Switch`
 * right, tinted with the configured accent while on. The whole row toggles
 * (matches platform settings). One screen-reader target: the row is a
 * `switch` with its checked state; the inner Switch is made non-accessible
 * so TalkBack/VoiceOver announce a single control.
 */
export const SettingsSwitchRow: React.FC<SettingsSwitchRowProps> = ({
  label,
  value,
  onValueChange,
  accessibilityLabel = label,
  showDivider = true,
}) => {
  const { colors, accentColor, typeface } = useTheme();

  const dividerStyle = showDivider
    ? { borderBottomWidth: 1, borderBottomColor: colors.border }
    : null;

  return (
    <PressableScale
      onPress={() => onValueChange(!value)}
      style={[styles.container, dividerStyle]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.labelSlot}>
        <Text
          style={[
            styles.label,
            { color: colors.primaryText, fontFamily: typeface },
          ]}
        >
          {label}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessible={false}
        trackColor={{ false: colors.surfaceElevated, true: accentColor }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.surfaceElevated}
      />
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
  },
  labelSlot: {
    flexShrink: 1,
    paddingRight: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.md,
  },
});