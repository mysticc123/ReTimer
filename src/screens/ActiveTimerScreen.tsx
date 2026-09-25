import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSettingsStore, useTimerStore } from '../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveTypeface } from '../theme';
import { PressableScale } from '../components/PressableScale';
import Animated from 'react-native-reanimated';
import { getThemeColors, colors } from '../theme/colors';
import { spacing, typography, borderRadius } from '../theme/colors';

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
  
  const [displayTime, setDisplayTime] = useState<number>(timer.durationMs);
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
    if (isRunning) {
      handlePause();
    } else {
      handleStart();
    }
  }, [isRunning, handlePause, handleStart]);

  const handleLongPress = useCallback(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    resetTimer();
    setIsRunning(false);
  }, [resetTimer, settings.hapticsEnabled]);

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
    if (timer.status === 'idle') {
      setDisplayTime(timer.mode === 'countup' ? 0 : timer.durationMs);
      setIsRunning(false);
    } else if (timer.status === 'completed') {
      setDisplayTime(timer.mode === 'countup' ? timer.elapsedTimeMs : 0);
      setIsRunning(false);
    } else if (timer.status === 'running') {
      // Reset display time when timer starts running
      lastUpdateRef.current = Date.now();
      setIsRunning(true);
    } else if (
      timer.status === 'paused' &&
      timer.elapsedTimeMs === 0 &&
      !timer.targetTimestamp
    ) {
      // Staged manual phase (never started): show its full duration.
      // Mid-phase pauses keep the frozen display (handled by RAF cleanup).
      setDisplayTime(timer.durationMs);
      setIsRunning(false);
    }
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

<Pressable
        onPress={handleTap}
        onLongPress={handleLongPress}
        accessibilityLabel={
          isRunning
            ? 'Pause timer'
            : timer.status === 'completed'
            ? 'Restart timer'
            : 'Start timer'
        }
        accessibilityHint={
          (() => {
            let hint = timer.status === 'completed'
              ? 'Tap to restart the same timer. Long press to reset.'
              : 'Tap to pause or resume. Long press to reset.';
            // Include phase/mode context for accessibility
            if (timer.mode === 'pomodoro' && timer.pomodoroConfig) {
              const phase = timer.isWorkPhase ? 'Focus' : timer.pomodoroFocusCount === 0 ? 'Long break' : 'Break';
              hint = `${phase}. ${hint}`;
            } else if (timer.mode === 'interval' && timer.intervalConfig) {
              const phase = timer.isWorkPhase ? 'Work' : 'Rest';
              hint = `${phase}, round ${timer.currentRound + 1} of ${timer.totalRounds}. ${hint}`;
            } else if (timer.mode === 'countup') {
              hint = `Counting up. ${hint}`;
            }
            return hint;
          })()
        }
        accessibilityRole="button"
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
        <View style={styles.timerContainer}>
          <Text
            style={[
              styles.timerText,
              {
                color: isRunning ? accentColor : themeColors.primaryText,
                fontSize: fontSize,
                fontFamily: resolveTypeface(settings.fontFamily, '700'),
              },
            ]}
            allowFontScaling={false}
          >
            {timeString}
          </Text>
        </View>

        {timer.intervalConfig && (
          <View
            style={
              isLandscape
                ? styles.landscapeRound
                : [styles.roundIndicator, { bottom: 100 + insets.bottom }]
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

        <PressableScale
          onPress={() => navigation.goBack()}
          style={
            isLandscape
              ? [
                  styles.landscapeExit,
                  {
                    right: insets.right + spacing.md,
                    bottom: insets.bottom + spacing.md,
                  },
                ]
              : [
                  styles.backButton,
                  { backgroundColor: themeColors.surface, bottom: 50 + insets.bottom },
                ]
          }
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.backButtonText,
              {
                color: themeColors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '500'),
              },
            ]}
          >
            ← Exit
          </Text>
        </PressableScale>
      </Pressable>
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
  timerText: {
    fontWeight: typography.fontWeights.bold,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  roundIndicator: {
    position: 'absolute',
    bottom: 100,
  },
  landscapeRound: {
    marginTop: spacing.sm,
  },
  roundText: {
    fontSize: typography.fontSizes.sm,
  },
  backButton: {
    position: 'absolute',
    bottom: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  landscapeExit: {
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
});
