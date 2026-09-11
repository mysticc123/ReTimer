/**
 * Color palette for the application
 */
export const colors = {
  // Core colors
  black: '#000000',
  white: '#FFFFFF',
  
  // Dark theme
  dark: {
    background: '#000000',
    surface: '#0A0A0A',
    surfaceElevated: '#141414',
    primaryText: '#FFFFFF',
    secondaryText: '#8A8A8A',
    border: '#1F1F1F',
  },
  
  // Light theme
  light: {
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    primaryText: '#0A0A0A',
    secondaryText: '#6B6B6B',
    border: '#E5E5E5',
  },
  
  // OLED Black theme (pure black)
  oled: {
    background: '#000000',
    surface: '#000000',
    surfaceElevated: '#050505',
    primaryText: '#FFFFFF',
    secondaryText: '#8A8A8A',
    border: '#141414',
  },
  
  // Accent colors (configurable)
  accent: {
    cyan: '#00F5D4',
    mint: '#00FFA3',
    blue: '#0066FF',
    purple: '#7B2CBF',
    orange: '#FF6B35',
    green: '#00D26A',
  },
  
  // Status colors
  status: {
    success: '#00D26A',
    warning: '#FFC107',
    error: '#FF4444',
    info: '#0066FF',
  },
};

/**
 * Get theme colors based on theme mode
 */
export const getThemeColors = (theme: 'dark' | 'light' | 'oled') => {
  switch (theme) {
    case 'light':
      return colors.light;
    case 'oled':
      return colors.oled;
    default:
      return colors.dark;
  }
};

/**
 * Spacing scale
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

/**
 * Border radius scale
 */
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

/**
 * Typography scale
 */
export const typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    xxxl: 48,
    display: 72,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

/**
 * Animation timing
 */
export const animation = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
  easing: {
    easeInOut: 'ease-in-out',
    easeOut: 'ease-out',
    easeIn: 'ease-in',
  },
};

/**
 * Default accent color
 */
export const DEFAULT_ACCENT_COLOR = colors.accent.cyan;
