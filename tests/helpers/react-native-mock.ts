/**
 * Minimal stand-in for `react-native`.
 *
 * `src/services/notifications.ts` only needs `AppState.addEventListener`,
 * so the mock exposes exactly that plus a test hook to fire app-state
 * changes deterministically.
 */

type AppStateListener = (state: string) => void;

const appStateListeners: AppStateListener[] = [];

export const AppState = {
  addEventListener(_event: string, listener: AppStateListener): { remove(): void } {
    appStateListeners.push(listener);
    return {
      remove(): void {
        const index = appStateListeners.indexOf(listener);
        if (index >= 0) appStateListeners.splice(index, 1);
      },
    };
  },
};

/** Mock NativeModules for exact alarm testing */
export const NativeModules = {
  ExactAlarmModule: {
    isExactAlarmAvailable: async (): Promise<boolean> => true,
    openExactAlarmSettings: async (): Promise<boolean> => false,
  },
};

/** Mock Platform for Android version detection */
export const Platform = {
  OS: 'android',
  Version: 34, // Android 14
};

/** Test-only: drop registered listeners. */
export function __reset(): void {
  appStateListeners.length = 0;
}

/** Test-only: synchronously fire an app-state change at all listeners. */
export function __fireAppState(state: string): void {
  for (const listener of [...appStateListeners]) listener(state);
}
