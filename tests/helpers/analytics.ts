/**
 * Analytics test helper - loads the compiled analytics module for testing.
 * Uses the same pattern as stores.ts to load real modules from the test build.
 */

import { createRequire } from 'node:module';
import type * as ViewModelModule from '../../src/utils/analyticsViewModel.js';
import type { AnalyticsModule } from './analytics-types.js';

const req = createRequire(process.cwd() + '/package.json');

const BUILD = process.cwd() + '/.test-build';
const ANALYTICS_PATH = BUILD + '/src/utils/analytics.js';
const VIEW_MODEL_PATH = BUILD + '/src/utils/analyticsViewModel.js';

let analyticsModule: AnalyticsModule | null = null;

/**
 * Load the analytics module for testing.
 * Returns the compiled analytics module with all exported functions and types.
 */
export async function loadAnalytics(): Promise<AnalyticsModule> {
  if (analyticsModule) return analyticsModule;
  
  // Clear any cached analytics module
  const cache: Record<string, unknown> = req.cache as unknown as Record<string, unknown>;
  for (const key of Object.keys(cache)) {
    if (key.replace(/\\/g, '/').includes('.test-build/src/utils/analytics')) {
      delete cache[key];
    }
  }
  analyticsModule = req(ANALYTICS_PATH) as AnalyticsModule;
  return analyticsModule;
}

/**
 * Load the Analytics-screen view model module, freshly bound to the
 * CURRENT cached analytics instance (call loadAnalytics() first so
 * setNowFn applies to the same module the view model delegates to).
 */
export async function loadViewModel(): Promise<typeof ViewModelModule> {
  const cache: Record<string, unknown> = req.cache as unknown as Record<string, unknown>;
  for (const key of Object.keys(cache)) {
    if (key.replace(/\\/g, '/').includes('.test-build/src/utils/analyticsViewModel')) {
      delete cache[key];
    }
  }
  return req(VIEW_MODEL_PATH) as typeof ViewModelModule;
}

/**
 * Set the clock function for the analytics module.
 * Delegates to the analytics module's setNowFn.
 */
export function setNowFn(fn?: () => number): void {
  if (analyticsModule) {
    analyticsModule.setNowFn?.(fn);
  }
}

/**
 * Get the analytics module instance (for direct access if needed).
 */
export function getAnalyticsModule(): AnalyticsModule | null {
  return analyticsModule;
}

// Re-export types for test files to import
export type { FocusSession, DailySummary, PeriodSummary, StreakInfo, AnalyticsModule } from './analytics-types.js';