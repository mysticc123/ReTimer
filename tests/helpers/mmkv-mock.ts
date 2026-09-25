/**
 * In-memory stand-in for `react-native-mmkv`.
 *
 * The timer store only uses `createMMKV()` plus `set` / `getString` /
 * `remove` on the returned instance, so this mock implements exactly that
 * surface. It is intentionally a process-wide singleton (like the real
 * default MMKV instance): wiping `require` cache for `src/` while keeping
 * this module cached faithfully simulates an app relaunch against the same
 * persisted bytes. Call `__reset()` for a blank slate between tests.
 */

interface MMKVInstance {
  set(key: string, value: string): void;
  getString(key: string): string | undefined;
  remove(key: string): void;
}

const backing = new Map<string, string>();

const instance: MMKVInstance = {
  set(key: string, value: string): void {
    backing.set(key, value);
  },
  getString(key: string): string | undefined {
    return backing.get(key);
  },
  remove(key: string): void {
    backing.delete(key);
  },
};

export function createMMKV(): MMKVInstance {
  return instance;
}

/** Test-only: drop all persisted bytes. */
export function __reset(): void {
  backing.clear();
}

/** Test-only: read the raw persisted string for a key. */
export function __readRaw(key: string): string | undefined {
  return backing.get(key);
}
