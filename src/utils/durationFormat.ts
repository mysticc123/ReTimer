/**
 * Shared duration formatting helpers.
 */

/** Two-digit display for wheel values: 0 → "00", 5 → "05". */
export function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Human-readable duration summary with zero units omitted:
 * 05:00 → "5m", 00:30 → "30s", 14:30 → "14m 30s", 120:00 → "2h".
 */
export function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}
