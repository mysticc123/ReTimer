import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { FocusSession } from '../types';

const storage = createMMKV();
const mmkvStorage = {
  setItem: (key: string, value: string) => storage.set(key, value),
  getItem: (key: string) => storage.getString(key) ?? null,
  removeItem: (key: string) => storage.remove(key),
};

// Analytics keeps the session-level inputs needed by the existing calendar,
// chart, and date-navigation calculations. It is a separate append-only
// persisted state from the user-visible, bounded History list.

interface AnalyticsState {
  sessions: FocusSession[];
  recordSession: (session: FocusSession) => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      sessions: [],
      recordSession: (session) =>
        set((state) => {
          if (state.sessions.some((existing) => existing.id === session.id)) {
            return state;
          }
          return { sessions: [...state.sessions, session] };
        }),
    }),
    {
      name: 'retimer-analytics-state',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
