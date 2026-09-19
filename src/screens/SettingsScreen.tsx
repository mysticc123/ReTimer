import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import { SettingsRow } from '../components/SettingsRow';
import { PressableScale } from '../components/PressableScale';
import { AccentColorPickerModal } from '../components/AccentColorPickerModal';
import { FontStylePickerModal } from '../components/FontStylePickerModal';
import { ThemePickerModal } from '../components/ThemePickerModal';
import { spacing, typography, borderRadius, colors, accentOptions, fontOptions, themeOptions } from '../theme/colors';
import { SteppedFontScaleSlider } from '../components/SteppedFontScaleSlider';

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
  const insets = useSafeAreaInsets();
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  const accentName =
    accentOptions.find((option) => option.value === settings.accentColor)?.name ??
    settings.accentColor;
  const fontName =
    fontOptions.find((option) => option.id === settings.fontFamily)?.name ??
    settings.fontFamily;
  const themeName =
    themeOptions.find((option) => option.id === settings.theme)?.name ??
    settings.theme;

  const toggleSetting = (key: keyof typeof settings, currentValue: any) => {
    if (typeof currentValue === 'boolean') {
      updateSettings({ [key]: !currentValue });
    }
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
              accessibilityLabel="Choose theme"
            />
            
            <SettingsRow
              label="Accent Color"
              value={accentName}
              onPress={() => setAccentPickerOpen(true)}
              accessibilityLabel="Choose accent color"
            />

            <SettingsRow
              label="Font"
              value={fontName}
              onPress={() => setFontPickerOpen(true)}
              accessibilityLabel="Choose font style"
            />
          </View>
        </View>

        {/* Audio Section */}
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
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(settings.fontFamily, '600'),
              },
            ]}
          >
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
              <Text
                style={[
                  styles.fontScaleLabel,
                  {
                    color: colors.primaryText,
                    fontFamily: resolveTypeface(settings.fontFamily, '500'),
                  },
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
    paddingHorizontal: spacing.md,
  },
  fontScaleLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.sm,
  },
});
