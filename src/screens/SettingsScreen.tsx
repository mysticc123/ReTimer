import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, useSettingsStore } from '../theme';
import { SettingsRow } from '../components/SettingsRow';
import { spacing, typography, borderRadius } from '../theme/colors';

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={[styles.backButton, { color: colors.accentColor }]}>
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
              onPress={() => {}}
              accessibilityLabel="Change theme"
            />
            
            <SettingsRow
              label="Accent Color"
              value={settings.accentColor}
              onPress={() => {}}
              accessibilityLabel="Change accent color"
            />
            
            <SettingsRow
              label="Font"
              value={settings.fontFamily.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              onPress={() => {}}
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
              value={`${Math.round(settings.pomodoroFocusMs / 60000)} min`}
              onPress={() => {}}
              accessibilityLabel="Change pomodoro focus duration"
            />
            
            <SettingsRow
              label="Pomodoro Break"
              value={`${Math.round(settings.pomodoroBreakMs / 60000)} min`}
              onPress={() => {}}
              accessibilityLabel="Change pomodoro break duration"
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
            
            <SettingsRow
              label="Larger Text"
              value={settings.largerText}
              onPress={() => toggleSetting('largerText', settings.largerText)}
              accessibilityLabel="Toggle larger text"
            />
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
});
