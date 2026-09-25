/**
 * Controllable stand-in for `expo-notifications`.
 *
 * Records every schedule/cancel call so tests can assert the deterministic
 * guarantees of `src/services/notifications.ts` (single slot, replace on
 * state change, nothing pending for paused/reset/completed/count-up)
 * without touching Android's AlarmManager. No timers, no network.
 */

export const SchedulableTriggerInputTypes = {
  DATE: 'date' as const,
};

export const AndroidImportance = {
  HIGH: 4 as const,
};

export interface RecordedSchedule {
  id: string;
  contentTitle: string;
  contentBody: string;
  contentData: unknown;
  triggerType: unknown;
  triggerDate: unknown;
  channelId: unknown;
}

export interface CallLog {
  schedules: RecordedSchedule[];
  cancels: string[];
  handlerSet: number;
  channelSets: unknown[];
  permissionGets: number;
  permissionRequests: number;
  sweeps: number;
  presentedDismissed: string[];
}

const log: CallLog = {
  schedules: [],
  cancels: [],
  handlerSet: 0,
  channelSets: [],
  permissionGets: 0,
  permissionRequests: 0,
  sweeps: 0,
  presentedDismissed: [],
};

/** Live scheduled notifications, keyed by mock id. */
const scheduled = new Map<string, RecordedSchedule>();

/** Delivered tray notifications this mock pretends are visible. */
const presented: Array<{ identifier: string; data: unknown }> = [];

/** Flip to simulate the user denying the permission prompt. */
export let __grantPermission = true;

/** Test-only: control the permission answer (direct assignment from
 * another module would miss the live binding, so use this setter). */
export function __setGrant(value: boolean): void {
  __grantPermission = value;
}

let nextId = 1;

export function __reset(): void {
  log.schedules = [];
  log.cancels = [];
  log.handlerSet = 0;
  log.channelSets = [];
  log.permissionGets = 0;
  log.permissionRequests = 0;
  log.sweeps = 0;
  log.presentedDismissed = [];
  scheduled.clear();
  presented.length = 0;
  __grantPermission = true;
  nextId = 1;
}

export function __log(): CallLog {
  return log;
}

/** Test-only: clear the call log while keeping scheduled/presented state. */
export function __resetLog(): void {
  log.schedules = [];
  log.cancels = [];
  log.handlerSet = 0;
  log.channelSets = [];
  log.permissionGets = 0;
  log.permissionRequests = 0;
  log.sweeps = 0;
  log.presentedDismissed = [];
}

/** Test-only: how many completion notifications are currently scheduled. */
export function __scheduledCount(): number {
  return scheduled.size;
}

/** Test-only: place a delivered notification in the fake tray. */
export function __present(identifier: string, data: unknown): void {
  presented.push({ identifier, data });
}

export async function getPermissionsAsync(): Promise<{ granted: boolean }> {
  log.permissionGets += 1;
  return { granted: __grantPermission };
}

export async function requestPermissionsAsync(): Promise<{ granted: boolean }> {
  log.permissionRequests += 1;
  return { granted: __grantPermission };
}

export function setNotificationHandler(handler: unknown): void {
  void handler;
  log.handlerSet += 1;
}

export async function setNotificationChannelAsync(
  channelId: string,
  channel: unknown,
): Promise<void> {
  log.channelSets.push({ channelId, channel });
}

interface ScheduleArgs {
  content: { title?: string; body?: string; data?: unknown };
  trigger: { type: unknown; date: unknown; channelId: unknown };
}

export async function scheduleNotificationAsync(args: ScheduleArgs): Promise<string> {
  const id = `mock-notif-${nextId++}`;
  const record: RecordedSchedule = {
    id,
    contentTitle: args.content.title ?? '',
    contentBody: args.content.body ?? '',
    contentData: args.content.data,
    triggerType: args.trigger.type,
    triggerDate: args.trigger.date,
    channelId: args.trigger.channelId,
  };
  scheduled.set(id, record);
  log.schedules.push(record);
  return id;
}

export async function cancelScheduledNotificationAsync(id: string): Promise<void> {
  log.cancels.push(id);
  scheduled.delete(id);
}

export async function getAllScheduledNotificationsAsync(): Promise<
  Array<{ identifier: string; content: { data?: unknown } }>
> {
  log.sweeps += 1;
  return Array.from(scheduled.values()).map((record) => ({
    identifier: record.id,
    content: { data: record.contentData },
  }));
}

export async function getPresentedNotificationsAsync(): Promise<
  Array<{ request: { identifier: string; content: { data?: unknown } } }>
> {
  return presented.map((item) => ({
    request: { identifier: item.identifier, content: { data: item.data } },
  }));
}

export async function dismissNotificationAsync(identifier: string): Promise<void> {
  log.presentedDismissed.push(identifier);
  const index = presented.findIndex((item) => item.identifier === identifier);
  if (index >= 0) presented.splice(index, 1);
}

type ResponseListener = (response: {
  notification: { request: { identifier: string; content: { data?: unknown } } };
}) => void;

const responseListeners: ResponseListener[] = [];

export function addNotificationResponseReceivedListener(
  listener: ResponseListener,
): { remove(): void } {
  responseListeners.push(listener);
  return {
    remove(): void {
      const index = responseListeners.indexOf(listener);
      if (index >= 0) responseListeners.splice(index, 1);
    },
  };
}
