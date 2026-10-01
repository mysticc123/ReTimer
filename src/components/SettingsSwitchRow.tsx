import React from 'react';
import { View, Text, StyleSheet, Switch, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './PressableScale';
import { spacing, typography } from '../theme/colors';

interface SettingsSwitchRowProps {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
  /** Keep this row stationary when used in the Settings screen. */
  disableScale?: boolean;
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
  disableScale = false,
  showDivider = true,
}) => {
  const { colors, accentColor, typeface } = useTheme();

  const dividerStyle = showDivider
    ? { borderBottomWidth: 1, borderBottomColor: colors.border }
    : null;

  const content = (
    <>
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
    </>
  );

  const pressableProps = {
    onPress: () => onValueChange(!value),
    style: [styles.container, dividerStyle],
    accessibilityRole: 'switch' as const,
    accessibilityState: { checked: value },
    accessibilityLabel,
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
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  labelSlot: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.md,
  },
});
