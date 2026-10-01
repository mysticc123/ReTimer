import { View, Text, StyleSheet, Pressable } from 'react-native';
import React from 'react';
import { useTheme, resolveTypeface } from '../theme';
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
  const { colors, accentColor, fontFamily } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || `${mode} timer`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: isSelected ? accentColor : colors.border,
          borderWidth: isSelected ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              {
                color: isSelected ? accentColor : colors.primaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
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
                  color: colors.secondaryText,
                  fontFamily: resolveTypeface(fontFamily, '400'),
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
