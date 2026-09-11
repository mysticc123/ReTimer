import { useSettingsStore } from '../store';
import { getThemeColors, colors } from './colors';
import { ThemeMode, FontFamily } from '../types';

/**
 * Get current theme configuration
 */
export const useTheme = () => {
  const { settings } = useSettingsStore();
  
  const themeColors = getThemeColors(settings.theme);
  
  return {
    theme: settings.theme as ThemeMode,
    colors: themeColors,
    accentColor: settings.accentColor,
    fontFamily: settings.fontFamily as FontFamily,
    isDark: settings.theme !== 'light',
    isOLED: settings.theme === 'oled',
  };
};

/**
 * Get font family based on settings
 */
export const getFontFamily = (fontFamily: FontFamily): string => {
  switch (fontFamily) {
    case 'jetbrains-mono':
      return 'JetBrainsMono-Regular';
    case 'roboto-mono':
      return 'RobotoMono-Regular';
    default:
      return 'Inter-Regular';
  }
};

/**
 * Get font family for monospace/timer display
 */
export const getTimerFontFamily = (fontFamily: FontFamily): string => {
  // For timer digits, always prefer monospace fonts for stability
  switch (fontFamily) {
    case 'inter':
      return 'Inter-Regular'; // Inter has tabular figures
    case 'jetbrains-mono':
      return 'JetBrainsMono-Regular';
    case 'roboto-mono':
      return 'RobotoMono-Regular';
    default:
      return 'Inter-Regular';
  }
};

/**
 * Theme provider hook for components needing theme values
 */
export const useThemedStyles = <T extends Record<string, any>>(
  stylesFactory: (theme: ReturnType<typeof useTheme>) => T
) => {
  const theme = useTheme();
  return stylesFactory(theme);
};
