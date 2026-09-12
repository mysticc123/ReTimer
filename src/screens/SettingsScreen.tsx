import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store';
import { SettingsRow } from '../components/SettingsRow';
import { spacing, typography, borderRadius, colors } from '../theme/colors';
import { FONT_SCALES, getScaledSize } from '../utils/fontScale';

type RootStackParamList = {
  Landing: undefined;
  ActiveTimer: undefined;
  Settings: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { settings, updateSettings } = useSettingsStore();

  const toggleSetting = (key: keyof typeof settings, currentValue: any) => {
    if (typeof currentValue === 'boolean') {
      updateSettings({ [key]: !currentValue });
    }
  };

  // Cycle through theme options: dark -> light -> oled -> dark
  const cycleTheme = () => {
    const themes: ('dark' | 'light' | 'oled')[] = ['dark', 'light', 'oled'];
    const currentIndex = themes.indexOf(settings.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    updateSettings({ theme: themes[nextIndex] });
  };

  // Cycle through accent colors
  const cycleAccentColor = () => {
    const accentColors = ['#00F5D4', '#00FFA3', '#0066FF', '#7B2CBF', '#FF6B35', '#00D26A'];
    const currentIndex = accentColors.indexOf(settings.accentColor);
    const nextIndex = (currentIndex + 1) % accentColors.length;
    updateSettings({ accentColor: accentColors[nextIndex] });
  };

  // Cycle through font options
  const cycleFont = () => {
    const fonts: ('inter' | 'jetbrains-mono' | 'roboto-mono')[] = ['inter', 'jetbrains-mono', 'roboto-mono'];
    const currentIndex = fonts.indexOf(settings.fontFamily);
    const nextIndex = (currentIndex + 1) % fonts.length;
    updateSettings({ fontFamily: fonts[nextIndex] });
  };

  const formatFontName = (font: string): string => {
    return font.replace('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Duration presets in milliseconds
  const FOCUS_PRESETS = [15, 20, 25, 30, 45, 60].map(m => m * 60 * 1000);
  const BREAK_PRESETS = [3, 5, 10, 15, 20].map(m => m * 60 * 1000);
  const COUNTDOWN_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => m * 60 * 1000);

  const cyclePomodoroFocus = () => {
    const currentIndex = FOCUS_PRESETS.indexOf(settings.pomodoroFocusMs);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % FOCUS_PRESETS.length;
    updateSettings({ pomodoroFocusMs: FOCUS_PRESETS[nextIndex] });
  };

  const cyclePomodoroBreak = () => {
    const currentIndex = BREAK_PRESETS.indexOf(settings.pomodoroBreakMs);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % BREAK_PRESETS.length;
    updateSettings({ pomodoroBreakMs: BREAK_PRESETS[nextIndex] });
  };

  const cycleCountdownDuration = () => {
    const currentFirst = settings.countdownPresetsMs[0] ?? 5 * 60 * 1000;
    const currentIndex = COUNTDOWN_PRESETS.indexOf(currentFirst);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % COUNTDOWN_PRESETS.length;
    // Update the first preset while keeping the rest of the array structure
    const newPresets = [COUNTDOWN_PRESETS[nextIndex], ...settings.countdownPresetsMs.slice(1)];
    updateSettings({ countdownPresetsMs: newPresets });
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ''}`;
    }
    return `${minutes} min`;
  };

  // Font scale control handlers
  const cycleFontScale = () => {
    const currentIndex = FONT_SCALES.indexOf(settings.fontScale as any);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % FONT_SCALES.length;
    updateSettings({ fontScale: FONT_SCALES[nextIndex] });
  };

  const selectFontScale = (scale: number) => {
    updateSettings({ fontScale: scale });
  };

  const formatFontScaleLabel = (scale: number): string => {
    return `${Math.round(scale * 100)}%`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={[styles.backButton, { color: settings.accentColor }]}>
            ← Back
          </Text>
        </Pressable>
        
        <Text style={[styles.title, { color: colors.primaryText }]}>
          Settings
        </Text>
        
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
            Appearance
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Theme"
              value={settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
              onPress={cycleTheme}
              accessibilityLabel="Change theme"
            />
            
            <SettingsRow
              label="Accent Color"
              value={settings.accentColor}
              onPress={cycleAccentColor}
              accessibilityLabel="Change accent color"
            />
            
            <SettingsRow
              label="Font"
              value={formatFontName(settings.fontFamily)}
              onPress={cycleFont}
              accessibilityLabel="Change font"
            />
          </View>
        </View>

        {/* Timer Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
            Timer
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Pomodoro Focus"
              value={formatDuration(settings.pomodoroFocusMs)}
              onPress={cyclePomodoroFocus}
              accessibilityLabel="Change pomodoro focus duration"
            />
            
            <SettingsRow
              label="Pomodoro Break"
              value={formatDuration(settings.pomodoroBreakMs)}
              onPress={cyclePomodoroBreak}
              accessibilityLabel="Change pomodoro break duration"
            />

            <SettingsRow
              label="Countdown Duration"
              value={formatDuration(settings.countdownPresetsMs[0] ?? 5 * 60 * 1000)}
              onPress={cycleCountdownDuration}
              accessibilityLabel="Change countdown duration"
            />
            
            <SettingsRow
              label="Auto-start Next"
              value={settings.autoStartNextInterval}
              onPress={() => toggleSetting('autoStartNextInterval', settings.autoStartNextInterval)}
              accessibilityLabel="Toggle auto-start next interval"
            />
          </View>
        </View>

        {/* Audio Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
            Audio & Haptics
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Sound Effects"
              value={settings.soundEnabled}
              onPress={() => toggleSetting('soundEnabled', settings.soundEnabled)}
              accessibilityLabel="Toggle sound effects"
            />
            
            <SettingsRow
              label="Haptic Feedback"
              value={settings.hapticsEnabled}
              onPress={() => toggleSetting('hapticsEnabled', settings.hapticsEnabled)}
              accessibilityLabel="Toggle haptic feedback"
            />
            
            <SettingsRow
              label="Ambient Audio"
              value={settings.ambientAudioEnabled}
              onPress={() => toggleSetting('ambientAudioEnabled', settings.ambientAudioEnabled)}
              accessibilityLabel="Toggle ambient audio"
            />
          </View>
        </View>

        {/* Display Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
            Display
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Keep Screen Awake"
              value={settings.keepScreenAwake}
              onPress={() => toggleSetting('keepScreenAwake', settings.keepScreenAwake)}
              accessibilityLabel="Toggle keep screen awake"
            />
            
            <SettingsRow
              label="Fullscreen Mode"
              value={settings.fullscreenMode}
              onPress={() => toggleSetting('fullscreenMode', settings.fullscreenMode)}
              accessibilityLabel="Toggle fullscreen mode"
            />
          </View>
        </View>

        {/* Accessibility Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
            Accessibility
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Reduced Motion"
              value={settings.reducedMotion}
              onPress={() => toggleSetting('reducedMotion', settings.reducedMotion)}
              accessibilityLabel="Toggle reduced motion"
            />
            
            {/* Font Scale Control */}
            <View style={styles.fontScaleSection}>
              <Text style={[styles.fontScaleLabel, { color: colors.primaryText }]}>
                Text Size
              </Text>
              
              {/* Scale Selector */}
              <View style={styles.fontScaleSelector}>
                {FONT_SCALES.map((scale) => (
                  <Pressable
                    key={scale}
                    style={[
                      styles.fontScaleButton,
                      settings.fontScale === scale && {
                        backgroundColor: settings.accentColor,
                      },
                    ]}
                    onPress={() => selectFontScale(scale)}
                    accessibilityLabel={`Set text size to ${formatFontScaleLabel(scale)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: settings.fontScale === scale }}
                  >
                    <Text
                      style={[
                        styles.fontScaleButtonText,
                        {
                          color: settings.fontScale === scale ? colors.background : colors.secondaryText,
                          fontSize: getScaledSize(12, scale),
                        },
                      ]}
                    >
                      Aa
                    </Text>
                  </Pressable>
                ))}
              </View>
              
              {/* Live Preview */}
              <View style={styles.fontScalePreview}>
                <Text
                  style={[
                    styles.fontScalePreviewText,
                    {
                      color: colors.primaryText,
                      fontSize: getScaledSize(16, settings.fontScale),
                    },
                  ]}
                >
                  Preview Text
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerSpacer: {
    width: 60,
  },
  backButton: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
  title: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  fontScaleSection: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  fontScaleLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.sm,
  },
  fontScaleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  fontScaleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#1F1F1F',
  },
  fontScaleButtonText: {
    fontWeight: typography.fontWeights.medium,
  },
  fontScalePreview: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
  },
  fontScalePreviewText: {
    fontWeight: typography.fontWeights.regular,
    lineHeight: 24,
  },
});
