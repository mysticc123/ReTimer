import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, Modal, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { TimerCard } from '../components/TimerCard';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsSwitchRow } from '../components/SettingsSwitchRow';
import { PressableScale } from '../components/PressableScale';
import { DurationEditorModal } from '../components/DurationEditorModal';
import { RoundsEditorModal } from '../components/RoundsEditorModal';
import { formatDurationShort } from '../utils/durationFormat';
import Animated, { FadeInDown, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore, useTimerStore } from '../store';
import type { IntervalConfig, PomodoroConfig, TimerMode } from '../types';
import { spacing, typography, borderRadius, getContrastText } from '../theme/colors';
import { MAX_LABEL_LENGTH, normalizeLabel } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons/Ionicons';

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
const POMODORO_LONG_BREAK_MIN_MS = 1000;
const POMODORO_LONG_BREAK_MAX_MS = 120 * 60 * 1000;
const POMODORO_SESSIONS_MIN = 2;
const POMODORO_SESSIONS_MAX = 8;

type DurationSettingKey =
  | 'pomodoroFocusMs'
  | 'pomodoroBreakMs'
  | 'pomodoroLongBreakMs'
  | 'pomodoroSessionsBeforeLongBreak'
  | 'countdownDurationMs'
  | 'intervalWorkMs'
  | 'intervalRestMs';

export const LandingScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, accentColor, fontFamily, typeface } = useTheme();
  // Readable text on the accent-backed Start buttons for every accent.
  const onAccentText = getContrastText(accentColor);
  const { initializeTimer, timer } = useTimerStore();
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
  /**
   * Draft label input for the currently expanded timer mode.
   * Cleared when a mode is collapsed; passed to initializeTimer on Start.
   */
  const [labelDraft, setLabelDraft] = useState<string>('');
  /**
   * Pending timer selection held while the replacement guard is shown.
   * `activeLabel` names the in-progress session at risk (e.g. "Pomodoro (paused)").
   */
  const [pendingSelect, setPendingSelect] = useState<{
    mode: TimerMode;
    durationMs: number;
    intervalConfig?: IntervalConfig;
    pomodoroConfig?: PomodoroConfig;
    activeLabel: string;
  } | null>(null);

  const activeTimerLabel = (mode: TimerMode, status: string): string => {
    const name =
      mode === 'pomodoro'
        ? 'Pomodoro'
        : mode === 'countdown'
          ? 'Countdown'
          : mode === 'countup'
            ? 'Count-Up'
            : 'Interval';
    return `${name} (${status})`;
  };

  // Determine if there's an existing running or paused timer that can be resumed.
  // Completed and idle timers are NOT resumable.
  const hasResumableTimer = timer.status === 'running' || timer.status === 'paused';
  const resumableTimerMode = hasResumableTimer ? timer.mode : null;
  const resumableTimerStatus = hasResumableTimer ? timer.status : null;

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
          longBreakMs: settings.pomodoroLongBreakMs,
          sessionsBeforeLongBreak: settings.pomodoroSessionsBeforeLongBreak,
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

    // Replacement guard: a running or paused session (including staged
    // manual phases, which report as paused) must never be silently
    // overwritten. Read the live status at tap time; idle/completed timers
    // need no guard and follow the existing direct path below.
    const activeTimer = useTimerStore.getState().timer;
    if (activeTimer.status === 'running' || activeTimer.status === 'paused') {
      setPendingSelect({
        mode,
        durationMs,
        intervalConfig,
        pomodoroConfig,
        activeLabel: activeTimerLabel(activeTimer.mode, activeTimer.status),
      });
      return;
    }

    initializeTimer(mode, durationMs, intervalConfig, pomodoroConfig, normalizeLabel(labelDraft));
    setLabelDraft('');
    navigation.navigate('ActiveTimer');
  };

  const resumeExistingTimer = (): void => {
    if (!hasResumableTimer) return;
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    // Navigate directly to ActiveTimer without calling initializeTimer.
    // The existing timer state in the store is the source of truth.
    navigation.navigate('ActiveTimer');
  };

  const startPendingSelect = (): void => {
    if (!pendingSelect) return;
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    initializeTimer(
      pendingSelect.mode,
      pendingSelect.durationMs,
      pendingSelect.intervalConfig,
      pendingSelect.pomodoroConfig,
      normalizeLabel(labelDraft)
    );
    setLabelDraft('');
    setPendingSelect(null);
    navigation.navigate('ActiveTimer');
  };

  const cancelPendingSelect = (): void => {
    // Dismiss only: the in-progress timer is untouched in the store.
    setPendingSelect(null);
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
    setLabelDraft('');
    setExpandedMode((current) => (current === mode ? null : mode));
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      const parts = [`${hours}h`];
      if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
      return parts.join(' ');
    }
    return `${minutes} min`;
  };

  const formatShortDuration = (ms: number): string => {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    return formatDuration(ms);
  };

  // Format the active timer label for the indicator: "Pomodoro" / "Countdown" / "Count-Up" / "Interval"
  const modeLabel = (mode: TimerMode): string => {
    switch (mode) {
      case 'pomodoro':
        return 'Pomodoro';
      case 'countdown':
        return 'Countdown';
      case 'countup':
        return 'Count-Up';
      case 'interval':
        return 'Interval';
    }
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
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
            hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
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

      {/* Active Timer Indicator (P2) — prominent, persistent when a timer is running/paused */}
      {hasResumableTimer && (
        <PressableScale
          onPress={resumeExistingTimer}
          accessibilityLabel={`Resume ${modeLabel(resumableTimerMode!)} timer (${resumableTimerStatus})`}
          accessibilityRole="button"
          style={[
            styles.activeTimerIndicator,
            { backgroundColor: accentColor, borderColor: colors.border },
          ]}
        >
          <View style={styles.activeTimerIndicatorContent}>
            <View style={styles.activeTimerIndicatorIcon}>
              <Ionicons
                name={resumableTimerStatus === 'running' ? 'pause-circle' : 'play-circle'}
                size={28}
                color={onAccentText}
              />
            </View>
            <View style={styles.activeTimerIndicatorText}>
              <Text
                style={[
                  styles.activeTimerIndicatorLabel,
                  { color: onAccentText, fontFamily: resolveTypeface(fontFamily, '500') },
                ]}
              >
                Active Timer
              </Text>
              <Text
                style={[
                  styles.activeTimerIndicatorMode,
                  { color: onAccentText, fontFamily: resolveTypeface(fontFamily, '600') },
                ]}
              >
                {modeLabel(resumableTimerMode!)}
              </Text>
              <Text
                style={[
                  styles.activeTimerIndicatorStatus,
                  { color: onAccentText, fontFamily: resolveTypeface(fontFamily, '400') },
                ]}
              >
                {resumableTimerStatus === 'running' ? 'Running' : 'Paused'}
              </Text>
              <Text
                style={[
                  styles.activeTimerIndicatorAction,
                  { color: onAccentText, fontFamily: resolveTypeface(fontFamily, '400') },
                ]}
              >
                {resumableTimerStatus === 'running' ? 'Tap to return' : 'Tap to resume'}
              </Text>
            </View>
          </View>
        </PressableScale>
      )}

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
            <SettingsRow
              label="Long break duration"
              value={formatDurationShort(settings.pomodoroLongBreakMs)}
              onPress={() => openDurationEditor('pomodoroLongBreakMs', 'Long break duration', POMODORO_LONG_BREAK_MIN_MS, POMODORO_LONG_BREAK_MAX_MS, 120)}
              accessibilityLabel="Change pomodoro long break duration"
            />
            <SettingsRow
              label="Sessions before long break"
              value={String(settings.pomodoroSessionsBeforeLongBreak)}
              onPress={() => openDurationEditor('pomodoroSessionsBeforeLongBreak', 'Sessions before long break', POMODORO_SESSIONS_MIN, POMODORO_SESSIONS_MAX, 8)}
              accessibilityLabel="Change number of focus sessions before long break"
            />
            <View style={styles.labelInputContainer}>
              <Text style={[
                styles.labelInputLabel,
                { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '500') }
              ]}>
                Label (optional)
              </Text>
              <TextInput
                style={[
                  styles.labelInput,
                  { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '400') }
                ]}
                placeholder="e.g. Deep work, Study, Email..."
                maxLength={MAX_LABEL_LENGTH}
                value={labelDraft}
                onChangeText={setLabelDraft}
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('pomodoro')}
              accessibilityLabel="Start Pomodoro timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  {
                    color: onAccentText,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                  },
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
          duration={formatShortDuration(settings.countdownDurationMs)}
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
            {/* Countdown Presets (P3) — quick-select from persisted countdownPresetsMs */}
            {settings.countdownPresetsMs.length > 0 && (
              <View style={[
                styles.presetSection,
                { borderBottomColor: colors.border },
              ]}>
                <Text style={[
                  styles.presetLabel,
                  { color: colors.secondaryText, fontFamily: resolveTypeface(fontFamily, '500') }
                ]}>
                  Presets
                </Text>
                <View style={styles.presetGrid}>
                  {settings.countdownPresetsMs.map((presetMs, index) => {
                    const isValidPreset = presetMs >= COUNTDOWN_MIN_MS && presetMs <= COUNTDOWN_MAX_MS;
                    if (!isValidPreset) return null;
                    return (
                      <PressableScale
                        key={index}
                        onPress={() => {
                          if (settings.hapticsEnabled) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }
                          updateSettings({ countdownDurationMs: presetMs });
                        }}
                        accessibilityLabel={`Set Countdown to ${formatDurationShort(presetMs)}`}
                        accessibilityRole="button"
                        style={[
                          styles.presetButton,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetButtonText,
                            { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '600') },
                          ]}
                        >
                          {formatDurationShort(presetMs)}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            )}
            <SettingsRow
              label="Duration"
              value={formatShortDuration(settings.countdownDurationMs)}
              onPress={() => openDurationEditor('countdownDurationMs', 'Countdown duration', COUNTDOWN_MIN_MS, COUNTDOWN_MAX_MS, 120)}
              accessibilityLabel="Change countdown duration"
            />
            <View style={styles.labelInputContainer}>
              <Text style={[
                styles.labelInputLabel,
                { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '500') }
              ]}>
                Label (optional)
              </Text>
              <TextInput
                style={[
                  styles.labelInput,
                  { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '400') }
                ]}
                placeholder="e.g. Deep work, Study, Email..."
                maxLength={MAX_LABEL_LENGTH}
                value={labelDraft}
                onChangeText={setLabelDraft}
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('countdown')}
              accessibilityLabel="Start Countdown timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  {
                    color: onAccentText,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                  },
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
            <SettingsSwitchRow
              label="Auto-start next phase"
              value={settings.autoStartNextInterval}
              onValueChange={(next) => updateSettings({ autoStartNextInterval: next })}
              accessibilityLabel="Automatically start the next Work/Rest phase when the current phase ends"
              showDivider={false}
            />
            <View style={styles.labelInputContainer}>
              <Text style={[
                styles.labelInputLabel,
                { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '500') }
              ]}>
                Label (optional)
              </Text>
              <TextInput
                style={[
                  styles.labelInput,
                  { color: colors.primaryText, fontFamily: resolveTypeface(fontFamily, '400') }
                ]}
                placeholder="e.g. Deep work, Study, Email..."
                maxLength={MAX_LABEL_LENGTH}
                value={labelDraft}
                onChangeText={setLabelDraft}
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <PressableScale
              style={[styles.startButton, { backgroundColor: accentColor }]}
              onPress={() => handleSelectTimer('interval')}
              accessibilityLabel="Start Interval timer"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.startButtonText,
                  {
                    color: onAccentText,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                  },
                ]}
              >
                Start
              </Text>
            </PressableScale>
          </Animated.View>
        )}
      </ScrollView>

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

      {/* Replacement guard: confirms discarding an in-progress session.
          Same destructive-confirm chrome as History (backdrop, card,
          Cancel/replace actions, 150ms fade); Cancel leaves the active
          timer untouched in the store. */}
      <Modal
        visible={pendingSelect !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={cancelPendingSelect}
        accessibilityViewIsModal
      >
        <Animated.View
          entering={settings.reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={settings.reducedMotion ? undefined : FadeOut.duration(150)}
          style={styles.backdrop}
        >
          <Pressable
            style={styles.backdropPress}
            onPress={cancelPendingSelect}
            accessibilityLabel="Keep current timer"
            accessibilityRole="button"
          />
          <Animated.View
            entering={settings.reducedMotion ? undefined : FadeIn.duration(150)}
            exiting={settings.reducedMotion ? undefined : FadeOut.duration(150)}
            style={[
              styles.confirmCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.confirmTitle,
                {
                  color: colors.primaryText,
                  fontSize: typography.fontSizes.lg,
                  fontFamily: resolveTypeface(fontFamily, '600'),
                },
              ]}
            >
              Replace timer?
            </Text>
            <Text
              style={[
                styles.confirmMessage,
                {
                  color: colors.secondaryText,
                  fontSize: typography.fontSizes.md,
                  fontFamily: resolveTypeface(fontFamily, '400'),
                },
              ]}
            >
              {`A ${pendingSelect?.activeLabel ?? 'timer'} is already in progress. Starting a new timer will discard it without saving to history.`}
            </Text>
            <View style={styles.buttonsRow}>
              <PressableScale
                onPress={cancelPendingSelect}
                accessibilityLabel="Keep current timer"
                accessibilityRole="button"
                style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: colors.secondaryText,
                      fontSize: typography.fontSizes.md,
                      fontFamily: resolveTypeface(fontFamily, '600'),
                    },
                  ]}
                >
                  Cancel
                </Text>
              </PressableScale>
              <PressableScale
                onPress={startPendingSelect}
                accessibilityLabel="Replace with new timer"
                accessibilityRole="button"
                style={[styles.button, styles.replaceButton]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    styles.replaceButtonText,
                    {
                      fontSize: typography.fontSizes.md,
                      fontFamily: resolveTypeface(fontFamily, '600'),
                    },
                  ]}
                >
                  Replace
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
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
  activeTimerIndicator: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  activeTimerIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  activeTimerIndicatorIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTimerIndicatorIconText: {
    fontSize: typography.fontSizes.lg,
  },
  activeTimerIndicatorText: {
    flex: 1,
  },
  activeTimerIndicatorLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  activeTimerIndicatorMode: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  activeTimerIndicatorStatus: {
    fontSize: typography.fontSizes.md,
    marginTop: spacing.xs,
  },
  activeTimerIndicatorAction: {
    fontSize: typography.fontSizes.sm,
    marginTop: spacing.xs,
    opacity: 0.8,
  },
  presetSection: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  presetLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  presetButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    minWidth: 72,
    alignItems: 'center',
  },
  presetButtonText: {
    fontSize: typography.fontSizes.sm,
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
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdropPress: {
    ...StyleSheet.absoluteFill,
  },
  confirmCard: {
    width: '85%',
    maxWidth: 340,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  confirmTitle: {
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmMessage: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: typography.fontWeights.semibold,
  },
  replaceButton: {
    backgroundColor: '#FF4444',
  },
  replaceButtonText: {
    color: '#FFFFFF',
  },
  labelInputContainer: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  labelInputLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  labelInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSizes.md,
    minHeight: 44,
  },
});
