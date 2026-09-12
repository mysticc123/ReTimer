import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { TimerCard } from '../components/TimerCard';
import { useTheme } from '../theme';
import { useTimerStore, useSettingsStore } from '../store';
import { spacing, typography, borderRadius } from '../theme/colors';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Landing: undefined;
  ActiveTimer: undefined;
  Settings: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const LandingScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, accentColor } = useTheme();
  const { initializeTimer } = useTimerStore();
  const { settings } = useSettingsStore();

  // Trigger light haptic on mount for feedback that app is ready
  useEffect(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const handleSelectTimer = (mode: 'pomodoro' | 'countdown' | 'countup' | 'interval') => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    let durationMs = 25 * 60 * 1000; // Default pomodoro
    let intervalConfig = undefined;

    switch (mode) {
      case 'pomodoro':
        durationMs = settings.pomodoroFocusMs;
        break;
      case 'countdown':
        durationMs = settings.countdownDurationMs;
        break;
      case 'countup':
        durationMs = 0; // Will be handled specially
        break;
      case 'interval':
        durationMs = settings.intervalWorkMs;
        intervalConfig = {
          workMs: settings.intervalWorkMs,
          restMs: settings.intervalRestMs,
          rounds: settings.intervalRounds,
        };
        break;
    }

    initializeTimer(mode, durationMs, intervalConfig);
    navigation.navigate('ActiveTimer');
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ''}`;
    }
    return `${minutes} min`;
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.primaryText }]}>
          ReTimer
        </Text>
        
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.settingsButton,
            pressed && styles.settingsButtonPressed,
          ]}
        >
          <Text style={[styles.settingsButtonText, { color: colors.secondaryText }]}>
            Settings
          </Text>
        </Pressable>
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
        Select a timer mode
      </Text>

      {/* Timer Options */}
      <View style={styles.timerList}>
        <TimerCard
          mode="pomodoro"
          title="Pomodoro"
          subtitle="Focus session"
          duration={formatDuration(settings.pomodoroFocusMs)}
          isSelected={false}
          onPress={() => handleSelectTimer('pomodoro')}
          accessibilityLabel="Start Pomodoro timer"
        />

        <TimerCard
          mode="countdown"
          title="Countdown"
          subtitle="Custom duration"
          duration={formatDuration(settings.countdownDurationMs)}
          isSelected={false}
          onPress={() => handleSelectTimer('countdown')}
          accessibilityLabel="Start Countdown timer"
        />

        <TimerCard
          mode="countup"
          title="Count-Up"
          subtitle="Stopwatch"
          duration="∞"
          isSelected={false}
          onPress={() => handleSelectTimer('countup')}
          accessibilityLabel="Start Count-Up timer"
        />

        <TimerCard
          mode="interval"
          title="Interval"
          subtitle="Work/Rest cycles"
          duration={`${Math.round(settings.intervalWorkMs / 1000)}s work`}
          isSelected={false}
          onPress={() => handleSelectTimer('interval')}
          accessibilityLabel="Start Interval timer"
        />
      </View>

      {/* Active timer indicator (if exists) */}
      {/* This will be implemented in next iteration */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    marginBottom: spacing.xl,
  },
  settingsButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  settingsButtonPressed: {
    opacity: 0.7,
  },
  settingsButtonText: {
    fontSize: typography.fontSizes.md,
  },
  timerList: {
    gap: spacing.sm,
  },
});
