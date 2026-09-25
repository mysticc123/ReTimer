import { AppState } from 'react-native';
import type { NativeEventSubscription } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSettingsStore, useTimerStore } from '../store';
import type { TimerState } from '../types';
import { formatDurationShort } from '../utils/durationFormat';
import { getExactAlarmStatus, isExactAlarmRequired, requestExactAlarmAccess as openExactAlarmSettings } from './exactAlarm';

/**
 * Phase-completion notifications (Issue #9).
 *
 * Design constraints (deliberate):
 * - The Zustand timer store stays the source of truth. This module only
 *   *observes* `(status, targetTimestamp, mode, ...)` via subscription and
 *   mirrors it into at most one scheduled OS notification. It never writes
 *   timer state, never touches history, and runs no timer loop of its own.
 * - A notification can only exist for a genuinely running phase
 *   (`status === 'running'` with a valid future `targetTimestamp`).
 *   Paused, staged, idle, completed, and count-up states always cancel.
 * - All async work runs through a single serialized queue, and every
 *   operation re-reads fresh store state after each await. A slow step
 *   (e.g. the permission dialog sitting open while the timer runs out)
 *   therefore aborts instead of scheduling a stale notification.
 */

export const COMPLETION_CHANNEL_ID = 'retimer-completions';

/** Marker placed in notification `data` so sweeps only touch our own. */
const DATA_TAG = 'retimer-phase-complete';

interface TrackedNotification {
  id: string;
  /** Exact timer-state key this notification was scheduled for. */
  key: string;
}

let chain: Promise<void> = Promise.resolve();
let tracked: TrackedNotification | null = null;
let unsubscribeStore: (() => void) | null = null;
let responseSubscription: NativeEventSubscription | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let initialized = false;

/**
 * Enqueue an operation behind all previously enqueued ones. Failures are
 * swallowed so one failed op can never wedge the queue.
 */
function enqueue(op: () => Promise<void>): void {
  chain = chain.then(op).catch(() => {});
}

/**
 * Identity of the schedulable running phase, or null when nothing may be
 * scheduled. Count-up never completes, so it is excluded even if running.
 */
function phaseKey(timer: TimerState): string | null {
  if (timer.status !== 'running') return null;
  if (timer.mode === 'countup') return null;
  const target = timer.targetTimestamp;
  if (typeof target !== 'number' || !Number.isFinite(target)) return null;
  if (target <= Date.now()) return null;
  return `${timer.mode}|${timer.isWorkPhase ? 'work' : 'rest'}|${timer.durationMs}|${target}`;
}

function phaseBody(timer: TimerState): string {
  const duration = formatDurationShort(timer.durationMs);
  if (timer.mode === 'countdown') return `Countdown complete · ${duration}`;
  if (timer.mode === 'pomodoro') {
    return timer.isWorkPhase
      ? `Focus session complete · ${duration}`
      : `Break over · ${duration}`;
  }
  // Interval: the message names the phase that ended, never implying a
  // focus session or a history record.
  return timer.isWorkPhase
    ? `Work interval complete · ${duration}`
    : `Break over · ${duration}`;
}

/**
 * Best-effort permission gate. Asked at most once ever (persisted flag);
 * a deny (or any failure) silently disables scheduling while the timer
 * itself keeps working exactly as before. No error UI by design.
 */
async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) {
      const settings = useSettingsStore.getState();
      if (settings.settings.notificationsAsked) return false;
      settings.updateSettings({ notificationsAsked: true });
      const next = await Notifications.requestPermissionsAsync();
      if (!next.granted) return false;
    }

    // On Android 12+, check exact-alarm access for UI warning purposes
    // We don't block scheduling - expo-notifications will schedule as inexact if needed
    if (isExactAlarmRequired()) {
      const exactAlarm = await getExactAlarmStatus();
      // Don't return false here - we still want to schedule (may be inexact)
      // The UI can use getExactAlarmAvailability() to warn the user
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if exact-alarm access is available for reliable background notifications.
 * Returns the detailed status for UI consumption.
 */
export async function getExactAlarmAvailability(): Promise<{
  notificationPermission: boolean;
  exactAlarmAvailable: boolean;
  exactAlarmRequired: boolean;
}> {
  let notificationPermission = false;
  try {
    const current = await Notifications.getPermissionsAsync();
    notificationPermission = current.granted;
  } catch {
    notificationPermission = false;
  }

  const exactAlarmRequired = isExactAlarmRequired();
  let exactAlarmAvailable = true;
  if (exactAlarmRequired) {
    const status = await getExactAlarmStatus();
    exactAlarmAvailable = status.available;
  }

  return {
    notificationPermission,
    exactAlarmAvailable,
    exactAlarmRequired,
  };
}

async function cancelTracked(): Promise<void> {
  if (tracked === null) return;
  const id = tracked.id;
  tracked = null;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or gone; nothing to do.
  }
}

/**
 * Reconcile the single scheduled notification with the CURRENT store
 * state (always re-read, never a stale snapshot). Safe to call from any
 * transition, any number of times, in any order — the queue serializes
 * execution and each run converges on the latest state.
 */
async function reconcile(): Promise<void> {
  const key = phaseKey(useTimerStore.getState().timer);
  if (key !== null && tracked !== null && tracked.key === key) return;
  await cancelTracked();
  if (key === null) return;
  const permitted = await ensurePermission();
  if (!permitted) return;
  // The permission prompt may have taken arbitrarily long: only schedule
  // if the timer is still the exact phase we evaluated above.
  const timer = useTimerStore.getState().timer;
  if (phaseKey(timer) !== key) return;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Timer complete',
        body: phaseBody(timer),
        data: { retimer: DATA_TAG, target: timer.targetTimestamp },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: timer.targetTimestamp as number,
        channelId: COMPLETION_CHANNEL_ID,
      },
    });
    // Final guard: if the state moved while scheduling, drop the result
    // instead of tracking a stale notification.
    if (phaseKey(useTimerStore.getState().timer) !== key) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Ignore; sweep on next launch covers leftovers.
      }
      return;
    }
    tracked = { id, key };
  } catch {
    // Scheduling unavailable (e.g. permissions revoked mid-flight):
    // timer behavior is unaffected.
  }
}

/** Cancel any ReTimer-tagged scheduled notifications (orphan sweep). */
async function sweepStaleScheduled(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      const data = request.content?.data as { retimer?: unknown } | undefined;
      if (data?.retimer === DATA_TAG) {
        try {
          await Notifications.cancelScheduledNotificationAsync(request.identifier);
        } catch {
          // Continue sweeping the rest.
        }
      }
    }
  } catch {
    // Scheduler unavailable; nothing to sweep.
  }
}

/** Dismiss our own delivered notifications currently in the tray. */
async function dismissPresentedOurs(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notification of presented) {
      const data = notification.request.content?.data as
        | { retimer?: unknown }
        | undefined;
      if (data?.retimer === DATA_TAG) {
        try {
          await Notifications.dismissNotificationAsync(
            notification.request.identifier
          );
        } catch {
          // Continue with the rest.
        }
      }
    }
  } catch {
    // Presenter unavailable; nothing to dismiss.
  }
}

async function initializeAsync(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(COMPLETION_CHANNEL_ID, {
      name: 'Timer completions',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // Non-Android or unavailable; scheduling degrades gracefully below.
  }
  await sweepStaleScheduled();
  tracked = null;
  await reconcile();
}

/**
 * Request exact-alarm access from the user by opening Android settings.
 * Returns true if access is available after the request (either already granted or user granted it).
 */
export async function requestExactAlarmAccess(): Promise<boolean> {
  if (!isExactAlarmRequired()) return true;
  const status = await getExactAlarmStatus();
  if (status.available) return true;
  // Open settings - the native module handles the intent
  await openExactAlarmSettings();
  // Re-check after returning
  const newStatus = await getExactAlarmStatus();
  return newStatus.available;
}

/**
 * Wire once from app bootstrap. Foreground notifications are suppressed
 * (the fullscreen timer is already showing completion); backgrounded posts
 * display via the channel. Tapping opens the app through normal launch
 * behavior and dismisses the notification — it never writes history or
 * completes a timer. Returns a cleanup for symmetry (App never unmounts).
 */
export function initializeNotifications(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  enqueue(initializeAsync);

  unsubscribeStore = useTimerStore.subscribe(() => {
    enqueue(reconcile);
  });

  responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content?.data as
        | { retimer?: unknown }
        | undefined;
      if (data?.retimer !== DATA_TAG) return;
      void Notifications.dismissNotificationAsync(
        response.notification.request.identifier
      ).catch(() => {});
    });

  appStateSubscription = AppState.addEventListener('change', (state) => {
    // Returning to the app with our completion already visible in the
    // tray would leave a stale duplicate of in-app state: clear it.
    if (state === 'active') {
      void dismissPresentedOurs();
    }
  });

  return () => {
    unsubscribeStore?.();
    unsubscribeStore = null;
    responseSubscription?.remove();
    responseSubscription = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}
