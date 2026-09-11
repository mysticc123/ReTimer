import { View, Text, StyleSheet, Pressable } from 'react-native';
import React from 'react';
import { useTheme } from '../theme';
import { spacing, borderRadius, typography } from '../theme/colors';

interface TimerCardProps {
  mode: string;
  title: string;
  subtitle?: string;
  duration?: string;
  icon?: React.ReactNode;
  isSelected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const TimerCard: React.FC<TimerCardProps> = ({
  mode,
  title,
  subtitle,
  duration,
  icon,
  isSelected = false,
  onPress,
  accessibilityLabel,
}) => {
  const { colors, accentColor, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || `${mode} timer`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: isSelected ? accentColor : colors.surface,
          borderColor: colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              {
                color: isSelected ? colors.black : colors.primaryText,
              },
            ]}
          >
            {title}
          </Text>
          
          {(subtitle || duration) && (
            <Text
              style={[
                styles.subtitle,
                {
                  color: isSelected ? colors.black : colors.secondaryText,
                },
              ]}
            >
              {subtitle}
              {subtitle && duration && ' • '}
              {duration}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.9,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  subtitle: {
    fontSize: typography.fontSizes.sm,
    marginTop: spacing.xs,
  },
});
