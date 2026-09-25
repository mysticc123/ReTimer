import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import type { AppSettings } from '../types';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsSwitchRow } from '../components/SettingsSwitchRow';
import { PressableScale } from '../components/PressableScale';
import { AccentColorPickerModal } from '../components/AccentColorPickerModal';
import { FontStylePickerModal } from '../components/FontStylePickerModal';
import { ThemePickerModal } from '../components/ThemePickerModal';
import { CompletionSoundPickerModal } from '../components/CompletionSoundPickerModal';
import { DurationEditorModal } from '../components/DurationEditorModal';
import { spacing, typography, borderRadius, accentOptions, fontOptions, themeOptions, colors as allColors } from '../theme/colors';
import { SteppedFontScaleSlider } from '../components/SteppedFontScaleSlider';
import { getExactAlarmAvailability, requestExactAlarmAccess } from '../services/notifications';
import { completionSoundName } from '../services/completionSound';
import { formatDurationShort } from '../utils/durationFormat';

type RootStackParamList = {
  Landing: undefined;
  ActiveTimer: undefined;
  Settings: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const GOAL_MIN_MS = 15 * 60 * 1000; // 15 minutes minimum
const GOAL_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours maximum

/** Boolean settings displayed as native switches. */
type BooleanSettingKey =
  | 'hapticsEnabled'
  | 'soundEnabled'
  | 'keepScreenAwake'
  | 'fullscreenMode'
  | 'reducedMotion';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, typeface } = useTheme();
  const { settings, updateSettings } = useSettingsStore();
  const insets = useSafeAreaInsets();
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [exactAlarmAvailable, setExactAlarmAvailable] = useState<boolean | null>(null);
  const [exactAlarmRequired, setExactAlarmRequired] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [checkingExactAlarm, setCheckingExactAlarm] = useState(false);
  const [durationEditor, setDurationEditor] = useState<{
    key: keyof AppSettings;
    title: string;
    minTotalMs: number;
    maxTotalMs: number;
    minutesMax: number;
  } | null>(null);

  const accentName =
    accentOptions.find((option) => option.value === settings.accentColor)?.name ??
    settings.accentColor;
  const fontName =
    fontOptions.find((option) => option.id === settings.fontFamily)?.name ??
    settings.fontFamily;
  const themeName =
    themeOptions.find((option) => option.id === settings.theme)?.name ??
    settings.theme;
  const soundName = completionSoundName(settings.completionSound);

  /** One shared toggle path for switch rows: light haptic (when enabled) + update. */
  const toggleBool = (key: BooleanSettingKey | 'timerCompletionBehavior', next: boolean) => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (key === 'timerCompletionBehavior') {
      updateSettings({ timerCompletionBehavior: next ? 'repeat' : 'stop' });
      return;
    }
    updateSettings({ [key]: next });
  };

  const checkExactAlarm = async () => {
    setCheckingExactAlarm(true);
    try {
      const availability = await getExactAlarmAvailability();
      setNotificationPermission(availability.notificationPermission);
      setExactAlarmRequired(availability.exactAlarmRequired);
      setExactAlarmAvailable(availability.exactAlarmAvailable);
    } catch {
      setExactAlarmAvailable(false);
      setExactAlarmRequired(false);
      setNotificationPermission(false);
    } finally {
      setCheckingExactAlarm(false);
    }
  };

  useEffect(() => {
    checkExactAlarm();
  }, []);

  useEffect(() => {
    // Re-check when the app returns to the foreground while this screen is
    // mounted — e.g. coming back from Android's Alarms & reminders settings
    // (which backgrounds the app without any navigation change, so no focus
    // event fires). addEventListener only fires on state changes, so this
    // never duplicates the mount check above. Single subscription, removed
    // on unmount.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkExactAlarm();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const handleExactAlarmPress = async () => {
    if (!exactAlarmRequired || exactAlarmAvailable) return;
    await requestExactAlarmAccess();
    await checkExactAlarm();
  };

  const openDurationEditor = (
    key: keyof AppSettings,
    title: string,
    minTotalMs: number,
    maxTotalMs: number,
    minutesMax: number
  ) => {
    setDurationEditor({ key, title, minTotalMs, maxTotalMs, minutesMax });
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text
            style={[
              styles.backButton,
              {
                color: settings.accentColor,
                fontFamily: resolveTypeface(settings.fontFamily, '500'),
              },
            ]}
          >
            ← Back
          </Text>
        </PressableScale>

        <Text
          style={[
            styles.title,
            {
              color: colors.primaryText,
              fontFamily: resolveTypeface(settings.fontFamily, '600'),
            },
          ]}
        >
          Settings
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
            Appearance
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Theme"
              value={themeName}
              onPress={() => setThemePickerOpen(true)}
              accessibilityLabel={`Theme, ${themeName}`}
            />
            <SettingsRow
              label="Accent Color"
              value={accentName}
              onPress={() => setAccentPickerOpen(true)}
              accessibilityLabel={`Accent color, ${accentName}`}
            />
            <SettingsRow
              label="Font"
              value={fontName}
              onPress={() => setFontPickerOpen(true)}
              accessibilityLabel={`Font, ${fontName}`}
            />

            <View style={styles.fontScaleSection}>
              <Text
                style={[
                  styles.fontScaleLabel,
                  { color: colors.primaryText, fontFamily: typeface },
                ]}
              >
                Text Size
              </Text>

              <SteppedFontScaleSlider
                value={settings.fontScale}
                onChange={(fontScale) => updateSettings({ fontScale })}
              />
            </View>
          </View>
        </View>

        {/* Sound & Haptics Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
            Sound & Haptics
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsSwitchRow
              label="Completion Sound"
              value={settings.soundEnabled}
              onValueChange={(next) => toggleBool('soundEnabled', next)}
              accessibilityLabel="Play a sound when a timer phase finishes"
            />
            <SettingsRow
              label="Sound Type"
              value={soundName}
              onPress={() => setSoundPickerOpen(true)}
              accessibilityLabel={`Sound type, ${soundName}`}
            />
            <SettingsSwitchRow
              label="Haptic Feedback"
              value={settings.hapticsEnabled}
              onValueChange={(next) => toggleBool('hapticsEnabled', next)}
              accessibilityLabel="Haptic feedback"
              showDivider={false}
            />
          </View>
        </View>

        {/* Goals Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
            Goals
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsRow
              label="Daily Target"
              value={formatDurationShort(settings.dailyFocusGoalMs)}
              onPress={() => openDurationEditor('dailyFocusGoalMs', 'Daily Focus Goal', GOAL_MIN_MS, GOAL_MAX_MS, 12)}
              accessibilityLabel={`Daily target, ${formatDurationShort(settings.dailyFocusGoalMs)}`}
              showDivider={false}
            />
          </View>
        </View>

        {/* Timer Behavior Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
            Timer Behavior
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsSwitchRow
              label="Repeat"
              value={settings.timerCompletionBehavior === 'repeat'}
              onValueChange={(next) => toggleBool('timerCompletionBehavior', next)}
              accessibilityLabel="Repeat the countdown automatically when it finishes"
              showDivider={false}
            />
          </View>
        </View>

        {/* Display Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
            Display
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SettingsSwitchRow
              label="Keep Screen Awake"
              value={settings.keepScreenAwake}
              onValueChange={(next) => toggleBool('keepScreenAwake', next)}
              accessibilityLabel="Keep screen awake"
            />
            <SettingsSwitchRow
              label="Fullscreen Mode"
              value={settings.fullscreenMode}
              onValueChange={(next) => toggleBool('fullscreenMode', next)}
              accessibilityLabel="Fullscreen mode"
            />
            <SettingsSwitchRow
              label="Reduced Motion"
              value={settings.reducedMotion}
              onValueChange={(next) => toggleBool('reducedMotion', next)}
              accessibilityLabel="Reduced motion"
              showDivider={false}
            />
          </View>
        </View>

        {/* Notifications Section */}
        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: colors.secondaryText,
                  fontFamily: resolveTypeface(settings.fontFamily, '600'),
                },
              ]}
            >
              Notifications
            </Text>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <SettingsRow
                label="Notification Permission"
                value={notificationPermission ? 'Granted' : 'Not Granted'}
                accessibilityLabel={`Notification permission, ${notificationPermission ? 'granted' : 'not granted'}`}
                showDivider={exactAlarmRequired}
              />

              {exactAlarmRequired && (
                <>
                  <SettingsRow
                    label="Exact Alarm Access"
                    value={exactAlarmAvailable ? 'Granted' : 'Required for reliable background notifications'}
                    onPress={handleExactAlarmPress}
                    accessibilityLabel={exactAlarmAvailable ? 'Exact alarm access granted' : 'Open Android settings to grant exact alarm access'}
                    showDivider={false}
                  />
                  {checkingExactAlarm && (
                    <View style={styles.checkingIndicator}>
                      <Text style={[
                        styles.checkingText,
                        { color: colors.secondaryText, fontFamily: resolveTypeface(settings.fontFamily, '400') }
                      ]}>
                        Checking...
                      </Text>
                    </View>
                  )}
                  {!exactAlarmAvailable && !checkingExactAlarm && (
                    <View style={styles.exactAlarmWarning}>
                      <Text style={[
                        styles.warningText,
                        { color: allColors.status.warning, fontFamily: resolveTypeface(settings.fontFamily, '400'), fontSize: typography.fontSizes.xs }
                      ]}>
                        ⚠ Background notifications may be delayed without exact alarm access. Tap above to grant.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <AccentColorPickerModal
        visible={accentPickerOpen}
        onClose={() => setAccentPickerOpen(false)}
      />
      <FontStylePickerModal
        visible={fontPickerOpen}
        onClose={() => setFontPickerOpen(false)}
      />
      <ThemePickerModal
        visible={themePickerOpen}
        onClose={() => setThemePickerOpen(false)}
      />
      <CompletionSoundPickerModal
        visible={soundPickerOpen}
        onClose={() => setSoundPickerOpen(false)}
      />
      <DurationEditorModal
        visible={durationEditor !== null}
        title={durationEditor?.title ?? 'Duration'}
        initialMs={durationEditor ? settings[durationEditor.key] as number : 0}
        minTotalMs={durationEditor?.minTotalMs ?? GOAL_MIN_MS}
        maxTotalMs={durationEditor?.maxTotalMs ?? GOAL_MAX_MS}
        minutesMax={durationEditor?.minutesMax ?? 12}
        onSave={(durationMs) => {
          if (durationEditor) {
            updateSettings({ [durationEditor.key]: durationMs });
          }
          setDurationEditor(null);
        }}
        onCancel={() => setDurationEditor(null)}
      />
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
    marginHorizontal: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  fontScaleSection: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  fontScaleLabel: {
    fontSize: typography.fontSizes.md,
    marginBottom: spacing.xs,
  },
  checkingIndicator: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  checkingText: {
    fontSize: typography.fontSizes.sm,
  },
  exactAlarmWarning: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  warningText: {
    fontSize: typography.fontSizes.xs,
  },
});