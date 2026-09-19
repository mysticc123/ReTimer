import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { TimerCard } from '../components/TimerCard';
import { SettingsRow } from '../components/SettingsRow';
import { PressableScale } from '../components/PressableScale';
import { DurationEditorModal } from '../components/DurationEditorModal';
import { RoundsEditorModal } from '../components/RoundsEditorModal';
import { formatDurationShort } from '../utils/durationFormat';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useTheme, resolveTypeface } from '../theme';
import { useTimerStore, useSettingsStore } from '../store';
import { spacing, typography, borderRadius } from '../theme/colors';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Landing: undefined;
  ActiveTimer: undefined;
  Settings: undefined;
  History: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ConfigurableMode = 'pomodoro' | 'countdown' | 'interval';

// Duration bounds in milliseconds. Each mode is configured with the shared
// wheel editor and persisted independently via the settings store.
// Pomodoro Focus/Break: any MM:SS up to 99:59.
// Countdown accepts any duration from 1 second up to the maximum.
// (Pomodoro and Interval keep their own intentional minimums.)
const COUNTDOWN_MIN_MS = 1000;
const COUNTDOWN_MAX_MS = 120 * 60 * 1000;
const INTERVAL_WORK_MIN_MS = 15 * 1000;
const INTERVAL_WORK_MAX_MS = 5 * 60 * 1000;
const INTERVAL_REST_MIN_MS = 5 * 1000;
const INTERVAL_REST_MAX_MS = 2 * 60 * 1000;

type DurationSettingKey =
  | 'pomodoroFocusMs'
  | 'pomodoroBreakMs'
  | 'countdownDurationMs'
  | 'intervalWorkMs'
  | 'intervalRestMs';

export const LandingScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, accentColor, fontFamily, typeface } = useTheme();
  const { initializeTimer } = useTimerStore();
  const { settings, updateSettings } = useSettingsStore();
  const [expandedMode, setExpandedMode] = useState<ConfigurableMode | null>(null);
  const [durationEditor, setDurationEditor] = useState<{
    key: DurationSettingKey;
    title: string;
    minTotalMs: number;
    maxTotalMs: number;
    minutesMax: number;
  } | null>(null);
  const [roundsEditorOpen, setRoundsEditorOpen] = useState(false);

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
    let pomodoroConfig = undefined;

    switch (mode) {
      case 'pomodoro':
        // Snapshot both durations: the cycle runs Focus first, then alternates.
        durationMs = settings.pomodoroFocusMs;
        pomodoroConfig = {
          focusMs: settings.pomodoroFocusMs,
          breakMs: settings.pomodoroBreakMs,
        };
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

    initializeTimer(mode, durationMs, intervalConfig, pomodoroConfig);
    navigation.navigate('ActiveTimer');
  };

  const handleCardPress = (mode: 'pomodoro' | 'countdown' | 'countup' | 'interval') => {
    // Count-Up needs no configuration (elapsed-time stopwatch) — start immediately.
    if (mode === 'countup') {
      handleSelectTimer(mode);
      return;
    }
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setExpandedMode((current) => (current === mode ? null : mode));
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

  const formatShortDuration = (ms: number): string => {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    return formatDuration(ms);
  };

  const openDurationEditor = (
    key: DurationSettingKey,
    title: string,
    minTotalMs: number,
    maxTotalMs: number,
    minutesMax: number
  ) => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setDurationEditor({ key, title, minTotalMs, maxTotalMs, minutesMax });
  };

  const openRoundsEditor = () => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setRoundsEditorOpen(true);
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
        <Text
          style={[
            styles.title,
            {
              color: colors.primaryText,
              fontFamily: resolveTypeface(fontFamily, '700'),
            },
          ]}
        >
          ReTimer
        </Text>
        
        <View style={styles.headerActions}>
          <PressableScale
            onPress={() => navigation.navigate('History')}
            accessibilityLabel="Open session history"
            accessibilityRole="button"
            style={styles.settingsButton}
          >
            <Text
              style={[
                styles.settingsButtonText,
                { color: colors.secondaryText, fontFamily: typeface },
              ]}
            >
              History
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            style={styles.settingsButton}
          >
            <Text
              style={[
                styles.settingsButtonText,
                { color: colors.secondaryText, fontFamily: typeface },
              ]}
            >
              Settings
            </Text>
          </PressableScale>
        </View>
      </View>

      {/* Subtitle */}
      <Text
        style={[
          styles.subtitle,
          { color: colors.secondaryText, fontFamily: typeface },
        ]}
      >
        Select a timer mode
      </Text>

      {/* Timer Options */}
      <ScrollView
        style={styles.timerList}
        contentContainerStyle={styles.timerListContent}
        showsVerticalScrollIndicator={false}
      >
        <TimerCard
          mode="pomodoro"
          title="Pomodoro"
          subtitle="Focus session"
          duration={formatDurationShort(settings.pomodoroFocusMs)}
          isSelected={expandedMode === 'pomodoro'}
          onPress={() => handleCardPress('pomodoro')}
          accessibilityLabel="Configure Pomodoro timer"
        />

        {expandedMode === 'pomodoro' && (
          <Animated.View
            entering={settings.reducedMotion ? undefined : FadeInDown.duration(200)}
            exiting={settings.reducedMotion ? undefined : FadeOut.duration(150)}
            layout={
              settings.reducedMotion
                ? undefined
                : LinearTransition.springify().damping(24).stiffness(300)
            }
            style={[styles.configPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SettingsRow
              label="Focus duration"
              value={formatDurationShort(settings.pomodoroFocusMs)}
              onPress={() => openDurationEditor('pomodoroFocusMs', 'Focus duration', 1000, 5999000, 99)}
              accessibilityLabel="Change pomodoro focus duration"
            />
            <SettingsRow
              label="Break duration"
              value={formatDurationShort(settings.pomodoroBreakMs)}
              onPress={() => openDurationEditor('pomodoroBreakMs', 'Break duration', 1000, 5999000, 99)}
              accessibilityLabel="Change pomodoro break duration"
            />
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('pomodoro')}
              accessibilityLabel="Start Pomodoro timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  { fontFamily: resolveTypeface(fontFamily, '600') },
                ]}
              >
                Start
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        <TimerCard
          mode="countdown"
          title="Countdown"
          subtitle="Custom duration"
          duration={formatDuration(settings.countdownDurationMs)}
          isSelected={expandedMode === 'countdown'}
          onPress={() => handleCardPress('countdown')}
          accessibilityLabel="Configure Countdown timer"
        />

        {expandedMode === 'countdown' && (
          <Animated.View
            entering={settings.reducedMotion ? undefined : FadeInDown.duration(200)}
            exiting={settings.reducedMotion ? undefined : FadeOut.duration(150)}
            layout={
              settings.reducedMotion
                ? undefined
                : LinearTransition.springify().damping(24).stiffness(300)
            }
            style={[styles.configPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SettingsRow
              label="Duration"
              value={formatDuration(settings.countdownDurationMs)}
              onPress={() => openDurationEditor('countdownDurationMs', 'Countdown duration', COUNTDOWN_MIN_MS, COUNTDOWN_MAX_MS, 120)}
              accessibilityLabel="Change countdown duration"
            />
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('countdown')}
              accessibilityLabel="Start Countdown timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  { fontFamily: resolveTypeface(fontFamily, '600') },
                ]}
              >
                Start
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        <TimerCard
          mode="countup"
          title="Count-Up"
          subtitle="Stopwatch"
          duration="∞"
          isSelected={false}
          onPress={() => handleCardPress('countup')}
          accessibilityLabel="Start Count-Up timer"
        />

        <TimerCard
          mode="interval"
          title="Interval"
          subtitle="Work/Rest cycles"
          duration={
            settings.intervalWorkMs >= 60000
              ? `${formatDuration(settings.intervalWorkMs)} work`
              : `${Math.round(settings.intervalWorkMs / 1000)}s work`
          }
          isSelected={expandedMode === 'interval'}
          onPress={() => handleCardPress('interval')}
          accessibilityLabel="Configure Interval timer"
        />

        {expandedMode === 'interval' && (
          <Animated.View
            entering={settings.reducedMotion ? undefined : FadeInDown.duration(200)}
            exiting={settings.reducedMotion ? undefined : FadeOut.duration(150)}
            layout={
              settings.reducedMotion
                ? undefined
                : LinearTransition.springify().damping(24).stiffness(300)
            }
            style={[styles.configPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SettingsRow
              label="Work duration"
              value={formatShortDuration(settings.intervalWorkMs)}
              onPress={() => openDurationEditor('intervalWorkMs', 'Work duration', INTERVAL_WORK_MIN_MS, INTERVAL_WORK_MAX_MS, 5)}
              accessibilityLabel="Change interval work duration"
            />
            <SettingsRow
              label="Rest duration"
              value={formatShortDuration(settings.intervalRestMs)}
              onPress={() => openDurationEditor('intervalRestMs', 'Rest duration', INTERVAL_REST_MIN_MS, INTERVAL_REST_MAX_MS, 2)}
              accessibilityLabel="Change interval rest duration"
            />
            <SettingsRow
              label="Rounds"
              value={String(settings.intervalRounds)}
              onPress={openRoundsEditor}
              accessibilityLabel="Change interval rounds"
            />
            <SettingsRow
              label="Auto-start next phase"
              value={settings.autoStartNextInterval}
              onPress={() => updateSettings({ autoStartNextInterval: !settings.autoStartNextInterval })}
              accessibilityLabel="Automatically start the next Work/Rest phase when the current phase ends"
            />
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('interval')}
              accessibilityLabel="Start Interval timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  { fontFamily: resolveTypeface(fontFamily, '600') },
                ]}
              >
                Start
              </Text>
            </PressableScale>
          </Animated.View>
        )}
      </ScrollView>

      {/* Active timer indicator (if exists) */}
      {/* This will be implemented in next iteration */}

      <DurationEditorModal
        visible={durationEditor !== null}
        title={durationEditor?.title ?? 'Duration'}
        initialMs={durationEditor ? settings[durationEditor.key] : 0}
        minTotalMs={durationEditor?.minTotalMs ?? 1000}
        maxTotalMs={durationEditor?.maxTotalMs ?? 5999000}
        minutesMax={durationEditor?.minutesMax ?? 99}
        onSave={(durationMs) => {
          if (durationEditor) {
            updateSettings({ [durationEditor.key]: durationMs });
          }
          setDurationEditor(null);
        }}
        onCancel={() => setDurationEditor(null)}
      />

      <RoundsEditorModal
        visible={roundsEditorOpen}
        initialRounds={settings.intervalRounds}
        onSave={(rounds) => {
          updateSettings({ intervalRounds: rounds });
          setRoundsEditorOpen(false);
        }}
        onCancel={() => setRoundsEditorOpen(false)}
      />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: typography.fontSizes.md,
  },
  timerList: {
    flex: 1,
  },
  timerListContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  configPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  startButton: {
    margin: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#000000',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
});
