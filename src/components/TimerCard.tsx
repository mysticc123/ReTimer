import { View, Text, StyleSheet } from 'react-native';
import React from 'react';
import { useTheme, resolveTypeface } from '../theme';
import { PressableScale } from './PressableScale';
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
  const { colors, accentColor, isDark, fontFamily } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || `${mode} timer`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? accentColor : colors.surface,
          borderColor: colors.border,
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
                color: isSelected ? '#000000' : colors.primaryText,
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
                  color: isSelected ? '#000000' : colors.secondaryText,
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
    </PressableScale>
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
