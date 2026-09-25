import { NativeModules, Platform } from 'react-native';

interface ExactAlarmModule {
  isExactAlarmAvailable(): boolean;
  openExactAlarmSettings(): Promise<boolean>;
}

const ExactAlarmModule = NativeModules.ExactAlarmModule as ExactAlarmModule | undefined;

export type ExactAlarmStatus =
  | { available: true; reason: 'not_required' | 'granted' }
  | { available: false; reason: 'denied' | 'unavailable' | 'error' };

export async function getExactAlarmStatus(): Promise<ExactAlarmStatus> {
  if (Platform.OS !== 'android') {
    return { available: true, reason: 'not_required' };
  }

  if (!ExactAlarmModule) {
    return { available: false, reason: 'unavailable' };
  }

  try {
    const isAvailable = await ExactAlarmModule.isExactAlarmAvailable();
    if (isAvailable) {
      return { available: true, reason: 'granted' };
    }
    return { available: false, reason: 'denied' };
  } catch {
    return { available: false, reason: 'error' };
  }
}

export async function requestExactAlarmAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (!ExactAlarmModule) {
    return false;
  }

  try {
    const wasAvailable = await ExactAlarmModule.isExactAlarmAvailable();
    if (wasAvailable) {
      return true;
    }

    // Open settings, user must grant and return
    const result = await ExactAlarmModule.openExactAlarmSettings();
    // Result is false if settings was opened (user needs to grant and return)
    return false;
  } catch {
    return false;
  }
}

export function isExactAlarmRequired(): boolean {
  return Platform.OS === 'android' && Platform.Version >= 31; // Android 12+
}