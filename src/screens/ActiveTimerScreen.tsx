import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSettingsStore, useTimerStore } from '../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveTypeface } from '../theme';
import { PressableScale } from '../components/PressableScale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getThemeColors } from '../theme/colors';
import { spacing, typography } from '../theme/colors';
import { getActiveTimerDisplayTime } from '../utils/activeTimerDisplay';

type RootStackParamList = {
  Landing: undefined;
  ActiveTimer: undefined;
  Settings: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const ActiveTimerScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { settings } = useSettingsStore();
  const { timer, startTimer, pauseTimer, resumeTimer, resetTimer, getRemainingTime, nextRound, nextPomodoroPhase, completeTimer } = useTimerStore();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isCountUp = timer.mode === 'countup';
  
  const [displayTime, setDisplayTime] = useState<number>(() => getActiveTimerDisplayTime(timer));
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  const themeColors = getThemeColors(settings.theme);
  const accentColor = settings.accentColor;

  const updateDisplayTime = useCallback(() => {
    // Count-up runs on elapsed time, not remaining time.
    if (timer.mode === 'countup') {
      if (timer.status === 'running' && timer.targetTimestamp) {
        setDisplayTime(Math.max(0, Date.now() - timer.targetTimestamp));
        animationRef.current = requestAnimationFrame(updateDisplayTime);
      } else {
        setDisplayTime(timer.elapsedTimeMs);
      }
      return;
    }

    if (timer.status === 'running' && timer.targetTimestamp) {
      const remaining = Math.max(0, timer.targetTimestamp - Date.now());
      setDisplayTime(remaining);

      if (remaining <= 0) {
        if (timer.mode === 'interval' && timer.intervalConfig) {
          // Advance to next phase. Do not schedule here with the stale
          // closure — the effect below restarts the loop with the fresh
          // targetTimestamp, avoiding a double-advance.
          nextRound();
          const freshStatus = useTimerStore.getState().timer.status;
          if (freshStatus !== 'running') {
            // Terminal completion, or a staged manual phase waiting for Start.
            setIsRunning(false);
            if (freshStatus === 'completed' && settings.hapticsEnabled) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }
          }
          return;
        }
        if (timer.mode === 'pomodoro' && timer.pomodoroConfig) {
          // Manual phase transition: the next phase is staged stopped and
          // waits for Start. Same stale-closure discipline as intervals.
          // Haptic marks each phase boundary (a Pomodoro session never ends,
          // so per-boundary feedback preserves the completion signal).
          nextPomodoroPhase();
          setIsRunning(false);
          if (settings.hapticsEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          return;
        }
        // Normal timer completed — persist completed status so resume/start can't get stuck.
        // P9: with Countdown repeat, completeTimer() restarts a fresh running
        // cycle instead of stopping; keep the display loop alive in that case
        // (same stale-closure discipline as interval auto-start above).
        completeTimer();
        const freshStatus = useTimerStore.getState().timer.status;
        if (freshStatus !== 'running') {
          setIsRunning(false);
        }
        if (settings.hapticsEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        return;
      }
      animationRef.current = requestAnimationFrame(updateDisplayTime);
    } else {
      const remaining = getRemainingTime();
      setDisplayTime(remaining);
    }
  }, [timer.status, timer.targetTimestamp, timer.mode, timer.intervalConfig, timer.pomodoroConfig, timer.elapsedTimeMs, settings.hapticsEnabled, getRemainingTime, nextRound, nextPomodoroPhase, completeTimer]);

  const handleStart = useCallback(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (timer.status === 'completed') {
      // Restart the same configuration: resetTimer clears the terminal
      // state (writes no history, nulls the phase clock) and startTimer
      // anchors a fresh phase clock from idle. Identical to the existing
      // long-press-reset then tap sequence; the new run records exactly
      // one session if and when it completes.
      lastUpdateRef.current = Date.now();
      resetTimer();
      startTimer();
      setIsRunning(true);
    } else if (timer.status === 'idle' || timer.status === 'paused') {
      if (timer.status === 'paused') {
        resumeTimer();
      } else {
        lastUpdateRef.current = Date.now();
        startTimer();
      }
      setIsRunning(true);
    }
  }, [timer.status, startTimer, resumeTimer, resetTimer, settings.hapticsEnabled]);

  const handlePause = useCallback(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    
    if (timer.status === 'running') {
      pauseTimer();
      setIsRunning(false);
    }
  }, [timer.status, pauseTimer, settings.hapticsEnabled]);

  const handleTap = useCallback(() => {
    if (timer.status === 'running') {
      handlePause();
    } else {
      handleStart();
    }
  }, [timer.status, handlePause, handleStart]);

  const handleReset = useCallback(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    resetTimer();
    setIsRunning(false);
  }, [resetTimer, settings.hapticsEnabled]);

  const timerActionLabel = timer.status === 'completed'
    ? 'Restart timer'
    : timer.status === 'running'
      ? 'Pause timer'
      : timer.status === 'paused'
        ? 'Resume timer'
        : 'Start timer';

  const purposeLabel = timer.label?.trim() || undefined;

  useEffect(() => {
    if (settings.keepScreenAwake && isRunning) {
      activateKeepAwakeAsync().catch(() => {});
    } else {
      deactivateKeepAwake().catch(() => {});
    }

    return () => {
      deactivateKeepAwake().catch(() => {});
    };
  }, [isRunning, settings.keepScreenAwake]);

  useEffect(() => {
    if (isRunning) {
      animationRef.current = requestAnimationFrame(updateDisplayTime);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, timer.mode, updateDisplayTime]);

  useEffect(() => {
    // The store snapshot is authoritative on mount, remount, pause, resume,
    // reset, and completion. Do not initialize from durationMs alone: a
    // paused or running timer may already be part-way through its phase.
    setDisplayTime(getActiveTimerDisplayTime(timer));
    lastUpdateRef.current = Date.now();
    setIsRunning(timer.status === 'running');
  }, [timer.status, timer.durationMs, timer.mode, timer.elapsedTimeMs, timer.targetTimestamp]);

  const timeString = formatTime(displayTime);
  // Preserve responsive text-scaling for all lengths (including HH:MM:SS).
  const portraitSize = timeString.length > 8
    ? typography.fontSizes.xxxl * settings.fontScale
    : typography.fontSizes.display * settings.fontScale;

  // Landscape focus size: conservatively larger than portrait, derived from
  // available dimensions so it fits without clipping (including HH:MM:SS).
  // ~0.6em average advance per tabular digit/colon; reserves ~170px vertically
  // for phase/status labels, exit control, and breathing room.
  const landscapeAvailWidth = width - Math.max(insets.left, insets.right) - spacing.lg * 2;
  const landscapeAvailHeight = height - insets.top - insets.bottom;
  const landscapeWidthCap = landscapeAvailWidth / (timeString.length > 5 ? 4.8 : 3.0);
  const landscapeHeightCap = Math.max(48, (landscapeAvailHeight - 170) / 1.15);
  const landscapeSize = Math.max(
    40,
    Math.min(portraitSize * 1.4, landscapeWidthCap, landscapeHeightCap)
  );

  const fontSize = isLandscape ? landscapeSize : portraitSize;

  return (
    <>
      <StatusBar style={settings.theme !== 'light' ? 'light' : 'dark'} hidden={settings.fullscreenMode || isLandscape} />
      <View
        style={[
          styles.container,
          {
            backgroundColor: themeColors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: isLandscape ? Math.max(insets.left, spacing.md) : undefined,
            paddingRight: isLandscape ? Math.max(insets.right, spacing.md) : undefined,
          },
        ]}
      >
        <PressableScale
          onPress={handleTap}
          onLongPress={handleReset}
          delayLongPress={3000}
          androidRipple={null}
          accessibilityLabel={timerActionLabel}
          accessibilityHint="Tap to control the timer. Hold for 3 seconds to reset it."
          accessibilityRole="button"
          style={[styles.timerSurface, isCountUp && styles.countUpSurface]}
        >
          <View style={styles.timerContainer}>
            {purposeLabel && <Text
              style={[
                styles.purposeLabel,
                {
                  color: themeColors.secondaryText,
                  fontFamily: resolveTypeface(settings.fontFamily, '600'),
                  ...(isCountUp ? styles.countUpPurposeLabel : null),
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {purposeLabel}
            </Text>}
            <Text
              style={[
                styles.timerText,
                {
                  color: isRunning ? accentColor : themeColors.primaryText,
                  fontSize: fontSize,
                  fontFamily: resolveTypeface(settings.fontFamily, '700'),
                  ...(isCountUp ? styles.countUpTimerText : null),
                },
              ]}
            >
              {timeString}
            </Text>
          </View>
        </PressableScale>

        {timer.intervalConfig && (
          <View
            style={
                isLandscape
                ? styles.landscapeRound
                : [styles.roundIndicator, { bottom: 178 + insets.bottom }]
            }
          >
            <Text
              style={[
                styles.roundText,
                {
                  color: themeColors.secondaryText,
                  fontFamily: resolveTypeface(settings.fontFamily, '400'),
                },
              ]}
            >
              Round {timer.currentRound + 1} / {timer.totalRounds}
            </Text>
          </View>
        )}

        {!isCountUp && <PressableScale
          onPress={() => navigation.goBack()}
          style={isLandscape
            ? [styles.landscapeExit, { right: insets.right + spacing.md, bottom: insets.bottom + spacing.md }]
            : [styles.exitButton, { bottom: 24 + insets.bottom }]}
          accessibilityLabel="Exit timer"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.secondaryText} />
        </PressableScale>}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerSurface: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  countUpSurface: {
    paddingHorizontal: 0,
    paddingVertical: spacing.xl,
  },
  timerText: {
    fontWeight: typography.fontWeights.bold,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  purposeLabel: {
    marginBottom: spacing.sm,
    letterSpacing: 1,
    fontSize: typography.fontSizes.sm,
  },
  countUpPurposeLabel: {
    marginBottom: spacing.md,
    fontSize: typography.fontSizes.lg,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  countUpTimerText: {
    letterSpacing: -3,
  },
  roundIndicator: {
    position: 'absolute',
    bottom: 178,
  },
  landscapeRound: {
    marginTop: spacing.sm,
  },
  roundText: {
    fontSize: typography.fontSizes.sm,
  },
  exitButton: {
    position: 'absolute',
    bottom: 24,
  },
  landscapeExit: {
    position: 'absolute',
    padding: spacing.sm,
  },
});
