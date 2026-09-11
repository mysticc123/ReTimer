import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
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
  const { colors } = useTheme();

  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { borderBottomColor: colors.border },
        onPress && pressed && styles.pressed,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={[styles.label, { color: colors.primaryText }]}>
        {label}
      </Text>
      
      {value !== undefined && (
        <Text style={[styles.value, { color: colors.secondaryText }]}>
          {typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value)}
        </Text>
      )}
      
      {onPress && (
        <Text style={[styles.chevron, { color: colors.secondaryText }]}>
          ›
        </Text>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  pressed: {
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
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
