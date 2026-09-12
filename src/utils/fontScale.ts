/**
 * Font scale utility for accessible text sizing
 */

/**
 * Supported font scale values
 */
export const FONT_SCALES = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5] as const;

export type FontScale = typeof FONT_SCALES[number];

/**
 * Get a scaled font size based on the base size and user's font scale setting
 * @param baseSize - The base font size in pixels
 * @param fontScale - The user's font scale multiplier (default: 1.0)
 * @returns The scaled font size, rounded to avoid sub-pixel rendering
 */
export function getScaledSize(baseSize: number, fontScale: number = 1.0): number {
  const scaled = baseSize * fontScale;
  // Round to nearest integer to avoid sub-pixel rendering issues
  return Math.round(scaled);
}

/**
 * Migrate legacy largerText boolean setting to fontScale number
 * @param legacyValue - The old largerText boolean value or undefined
 * @returns The corresponding fontScale value
 */
export function migrateLegacyFontSize(legacyValue: any): FontScale {
  if (typeof legacyValue === 'boolean') {
    return legacyValue ? 1.2 : 1.0;
  }
  
  if (typeof legacyValue === 'number' && FONT_SCALES.includes(legacyValue as FontScale)) {
    return legacyValue as FontScale;
  }
  
  // Default fallback
  return 1.0;
}
