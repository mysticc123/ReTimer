import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSettingsStore, useTimerStore } from '../store';
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
  const { timer, startTimer, pauseTimer, resumeTimer, resetTimer, getRemainingTime, nextRound } = useTimerStore();
  
  const [displayTime, setDisplayTime] = useState<number>(timer.durationMs);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  const themeColors = getThemeColors(settings.theme);
  const accentColor = settings.accentColor;

  const updateDisplayTime = useCallback(() => {
    if (timer.status === 'running' && timer.targetTimestamp) {
      const remaining = Math.max(0, timer.targetTimestamp - Date.now());
      setDisplayTime(remaining);
      
      // Check for interval completion and auto-advance
      if (remaining <= 0) {
        if (timer.mode === 'interval' && timer.intervalConfig) {
          // Auto-advance to next phase/round
          nextRound();
          // Continue running animation for next phase
          animationRef.current = requestAnimationFrame(updateDisplayTime);
        } else {
          // Timer completed
          setIsRunning(false);
          if (settings.hapticsEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        }
      } else {
        animationRef.current = requestAnimationFrame(updateDisplayTime);
      }
    } else if (timer.mode === 'countup') {
      const now = Date.now();
      const elapsed = now - lastUpdateRef.current;
      setDisplayTime(elapsed);
      animationRef.current = requestAnimationFrame(updateDisplayTime);
    } else {
      const remaining = getRemainingTime();
      setDisplayTime(remaining);
    }
  }, [timer.status, timer.targetTimestamp, timer.mode, timer.intervalConfig, settings.hapticsEnabled, getRemainingTime, nextRound]);

  const handleStart = useCallback(() => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    
    if (timer.status === 'idle' || timer.status === 'paused') {
      if (timer.status === 'paused') {
        resumeTimer();
      } else {
        lastUpdateRef.current = Date.now();
        startTimer();
      }
      setIsRunning(true);
    }
  }, [timer.status, startTimer, resumeTimer, settings.hapticsEnabled]);

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
    if (isRunning && timer.mode !== 'countup') {
      animationRef.current = requestAnimationFrame(updateDisplayTime);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, timer.mode, updateDisplayTime]);

  useEffect(() => {
    if (timer.status === 'idle' || timer.status === 'completed') {
      setDisplayTime(timer.durationMs);
      setIsRunning(false);
    } else if (timer.status === 'running') {
      // Reset display time when timer starts running
      lastUpdateRef.current = Date.now();
      setIsRunning(true);
    }
  }, [timer.status, timer.durationMs]);

  // Handle interval phase changes for display
  useEffect(() => {
    if (timer.mode === 'interval' && timer.intervalConfig && timer.status === 'running') {
      const currentPhaseDuration = timer.isWorkPhase 
        ? timer.intervalConfig.workMs 
        : timer.intervalConfig.restMs;
      setDisplayTime(currentPhaseDuration);
      lastUpdateRef.current = Date.now();
    }
  }, [timer.mode, timer.intervalConfig, timer.isWorkPhase, timer.status]);

  const timeString = formatTime(displayTime);
  const fontSize = timeString.length > 8 
    ? typography.fontSizes.xxxl 
    : typography.fontSizes.display * (settings.largerText ? 1.2 : 1);

  return (
    <>
      <StatusBar style={settings.theme !== 'light' ? 'light' : 'dark'} hidden={settings.fullscreenMode} />
      
      <Pressable
        onPress={handleTap}
        onLongPress={handleLongPress}
        accessibilityLabel={isRunning ? 'Pause timer' : 'Start timer'}
        accessibilityRole="button"
        accessibilityHint="Tap to pause or resume. Long press to reset."
        style={[
          styles.container,
          { backgroundColor: themeColors.background },
        ]}
      >
        <View style={styles.timerContainer}>
          <Text
            style={[
              styles.timerText,
              {
                color: isRunning ? accentColor : themeColors.primaryText,
                fontSize: fontSize,
                fontFamily: settings.fontFamily === 'inter' ? 'System' : 'monospace',
              },
            ]}
            allowFontScaling={false}
          >
            {timeString}
          </Text>
          
          {timer.mode !== 'countdown' && timer.mode !== 'interval' && (
            <Text
              style={[
                styles.modeText,
                { color: themeColors.secondaryText },
              ]}
            >
              {timer.mode === 'pomodoro' && 'Pomodoro'}
              {timer.mode === 'countup' && 'Counting Up'}
            </Text>
          )}
          
          {timer.mode === 'interval' && timer.intervalConfig && timer.status !== 'idle' && (
            <Text
              style={[
                styles.modeText,
                { color: timer.isWorkPhase ? accentColor : themeColors.secondaryText },
              ]}
            >
              {timer.isWorkPhase ? 'WORK' : 'REST'}
            </Text>
          )}
          
          <Text
            style={[
              styles.statusText,
              { color: themeColors.secondaryText },
            ]}
          >
            {timer.status === 'idle' && 'Tap to start'}
            {timer.status === 'running' && 'Running'}
            {timer.status === 'paused' && 'Paused'}
            {timer.status === 'completed' && 'Completed'}
          </Text>
        </View>

        {timer.intervalConfig && (
          <View style={styles.roundIndicator}>
            <Text style={[styles.roundText, { color: themeColors.secondaryText }]}>
              Round {timer.currentRound + 1} / {timer.totalRounds}
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => navigation.goBack()}
          style={[
            styles.backButton,
            { backgroundColor: themeColors.surface },
          ]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={[styles.backButtonText, { color: themeColors.secondaryText }]}>
            ← Exit
          </Text>
        </Pressable>
      </Pressable>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerContainer: {
    alignItems: 'center',
  },
  timerText: {
    fontWeight: typography.fontWeights.bold,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  modeText: {
    fontSize: typography.fontSizes.md,
    marginTop: spacing.md,
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
  },
  statusText: {
    fontSize: typography.fontSizes.sm,
    marginTop: spacing.sm,
  },
  roundIndicator: {
    position: 'absolute',
    bottom: 100,
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
  backButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
});
