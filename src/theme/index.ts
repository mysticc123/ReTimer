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
    /** Regular-weight typeface for the selected font setting. */
    typeface: resolveTypeface(settings.fontFamily as FontFamily, '400'),
    isDark: settings.theme !== 'light',
    isOLED: settings.theme === 'oled',
  };
};

/**
 * Loaded typeface weights. These names must match the families registered
 * via useFonts in App.tsx (expo-google-fonts shorthand keys).
 */
export type TypefaceWeight = '400' | '500' | '600' | '700';

/**
 * Resolve a font setting to an actually-registered typeface.
 * Inter ships 400/500/600/700; the mono faces ship 400 only (weights fall
 * back to the 400 family and render via the style's fontWeight).
 */
export const resolveTypeface = (
  fontFamily: FontFamily,
  weight: TypefaceWeight = '400'
): string => {
  switch (fontFamily) {
    case 'jetbrains-mono':
      return 'JetBrainsMono_400Regular';
    case 'roboto-mono':
      return 'RobotoMono_400Regular';
    case 'space-mono':
      return weight === '600' || weight === '700'
        ? 'SpaceMono_700Bold'
        : 'SpaceMono_400Regular';
    case 'oswald':
      switch (weight) {
        case '500':
          return 'Oswald_500Medium';
        case '600':
          return 'Oswald_600SemiBold';
        case '700':
          return 'Oswald_700Bold';
        default:
          return 'Oswald_400Regular';
      }
    case 'roboto':
      switch (weight) {
        case '500':
          return 'Roboto_500Medium';
        case '600':
          return 'Roboto_600SemiBold';
        case '700':
          return 'Roboto_700Bold';
        default:
          return 'Roboto_400Regular';
      }
    case 'inter':
    default:
      switch (weight) {
        case '500':
          return 'Inter_500Medium';
        case '600':
          return 'Inter_600SemiBold';
        case '700':
          return 'Inter_700Bold';
        default:
          return 'Inter_400Regular';
      }
  }
};
