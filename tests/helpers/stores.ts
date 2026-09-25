/**
 * Isolated store loading for tests.
 *
 * Every `loadStores()` call drops compiled `src/` modules from the require
 * cache (keeping the mock modules cached) and re-requires the REAL store
 * and notification service, then rehydrates zustand/persist from the mock
 * MMKV bytes. Combined with `resetMocks()` this gives each test a pristine
 * app instance; `relaunch()` instead keeps the persisted bytes to simulate
 * a process restart against the same storage.
 */

import { createRequire } from 'node:module';
import type * as StoreModule from '../../src/store/index.js';
import type * as NotificationsModule from '../../src/services/notifications.js';
import type * as CompletionSoundModule from '../../src/services/completionSound.js';
import type * as MmkvMock from './mmkv-mock.js';
import type * as ExpoMock from './expo-notifications-mock.js';
import type * as RnMock from './react-native-mock.js';

const req = createRequire(process.cwd() + '/package.json');

const BUILD = process.cwd() + '/.test-build';
const STORE_PATH = BUILD + '/src/store/index.js';
const NOTIFICATIONS_PATH = BUILD + '/src/services/notifications.js';
const COMPLETION_SOUND_PATH = BUILD + '/src/services/completionSound.js';
const MMKV_MOCK_PATH = BUILD + '/tests/helpers/mmkv-mock.js';
const EXPO_MOCK_PATH = BUILD + '/tests/helpers/expo-notifications-mock.js';
const RN_MOCK_PATH = BUILD + '/tests/helpers/react-native-mock.js';

export interface StoreHandles {
  useTimerStore: typeof StoreModule.useTimerStore;
  useSettingsStore: typeof StoreModule.useSettingsStore;
  restoreTimerState: typeof StoreModule.restoreTimerState;
}

export interface LoadedApp extends StoreHandles {
  notifications: typeof NotificationsModule;
  completionSound: typeof CompletionSoundModule;
}

function bustSrcCache(): void {
  const cache: Record<string, unknown> = req.cache as unknown as Record<string, unknown>;
  for (const key of Object.keys(cache)) {
    // Cache keys use OS separators (backslashes on Windows).
    if (key.replace(/\\/g, '/').includes('.test-build/src/')) delete cache[key];
  }
}

/** Clear mock MMKV bytes, mock notification state, and AppState listeners. */
export function resetMocks(): void {
  (req(MMKV_MOCK_PATH) as typeof MmkvMock).__reset();
  (req(EXPO_MOCK_PATH) as typeof ExpoMock).__reset();
  (req(RN_MOCK_PATH) as typeof RnMock).__reset();
}

/** Clear only the expo mock call log, keeping scheduled/presented state. */
export function resetExpoLog(): void {
  (req(EXPO_MOCK_PATH) as typeof ExpoMock).__resetLog();
}

export function expoMock(): typeof ExpoMock {
  return req(EXPO_MOCK_PATH) as typeof ExpoMock;
}

export function mmkvMock(): typeof MmkvMock {
  return req(MMKV_MOCK_PATH) as typeof MmkvMock;
}

export function rnMock(): typeof RnMock {
  return req(RN_MOCK_PATH) as typeof RnMock;
}

async function rehydrate(handles: StoreHandles): Promise<void> {
  await handles.useTimerStore.persist.rehydrate();
  await handles.useSettingsStore.persist.rehydrate();
}

/**
 * Load a pristine app instance: fresh store modules, empty storage,
 * reset mocks, rehydrated (empty) state.
 */
export async function loadStores(): Promise<LoadedApp> {
  bustSrcCache();
  resetMocks();
  const store = req(STORE_PATH) as typeof StoreModule;
  const notifications = req(NOTIFICATIONS_PATH) as typeof NotificationsModule;
  const completionSound = req(COMPLETION_SOUND_PATH) as typeof CompletionSoundModule;
  const handles: LoadedApp = {
    useTimerStore: store.useTimerStore,
    useSettingsStore: store.useSettingsStore,
    restoreTimerState: store.restoreTimerState,
    notifications,
    completionSound,
  };
  await rehydrate(handles);
  return handles;
}

/**
 * Simulate process death + relaunch: fresh store modules rehydrated from
 * the SURVIVING mock MMKV bytes. Expo mock state (scheduled alarms) is
 * intentionally kept, mirroring OS-persisted alarms; the call log is
 * cleared so post-relaunch behavior asserts cleanly.
 */
export async function relaunch(): Promise<LoadedApp> {
  bustSrcCache();
  resetExpoLog();
  const store = req(STORE_PATH) as typeof StoreModule;
  const notifications = req(NOTIFICATIONS_PATH) as typeof NotificationsModule;
  const completionSound = req(COMPLETION_SOUND_PATH) as typeof CompletionSoundModule;
  const handles: LoadedApp = {
    useTimerStore: store.useTimerStore,
    useSettingsStore: store.useSettingsStore,
    restoreTimerState: store.restoreTimerState,
    notifications,
    completionSound,
  };
  await rehydrate(handles);
  return handles;
}

/** Drain the notification service's serialized async queue. */
export async function flushQueue(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
