import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  addWeeks,
  buildMonthlySummary,
  buildOverallSummary,
  buildYearSummary,
  startOfMonth,
  startOfWeek,
} from '../src/utils/analytics.js';
import { buildAnalyticsViewModel } from '../src/utils/analyticsViewModel.js';
import type { FocusSession } from '../src/types/index.js';

const session = (completedAtMs: number, actualDurationMs = 60_000): FocusSession => ({
  id: String(completedAtMs),
  mode: 'countdown',
  phase: 'single',
  plannedDurationMs: actualDurationMs,
  actualDurationMs,
  startedAtMs: completedAtMs - actualDurationMs,
  completedAtMs,
});

test('calendar navigation advances exact weeks across month and year boundaries', () => {
  const septemberEndWeek = startOfWeek(new Date(2026, 8, 29, 12).getTime());
  const nextWeek = addWeeks(septemberEndWeek, 1);
  const previousWeek = addWeeks(septemberEndWeek, -1);

  assert.equal(new Date(septemberEndWeek).getDate(), 28);
  assert.equal(new Date(nextWeek).getDate(), 5);
  assert.equal(new Date(nextWeek).getMonth(), 9);
  assert.equal(new Date(previousWeek).getDate(), 21);

  const yearBoundaryWeek = startOfWeek(new Date(2026, 11, 29, 12).getTime());
  assert.equal(new Date(addWeeks(yearBoundaryWeek, 1)).getFullYear(), 2027);
});

test('month navigation handles year rollover and leap February', () => {
  const december = startOfMonth(new Date(2026, 11, 15).getTime());
  const january = addMonths(december, 1);
  assert.equal(new Date(january).getFullYear(), 2027);
  assert.equal(new Date(january).getMonth(), 0);

  const february = addMonths(startOfMonth(new Date(2028, 0, 1).getTime()), 1);
  const march = addMonths(february, 1);
  assert.equal(new Date(march - 1).getDate(), 29);

  const februarySummary = buildMonthlySummary([], february);
  assert.equal(februarySummary.periodEnd - februarySummary.periodStart, 29 * 24 * 60 * 60 * 1000);
});

test('year-to-date and overall summaries use existing valid-session filtering', () => {
  const now = new Date(2026, 8, 20, 12).getTime();
  const january = new Date(2026, 0, 10, 12).getTime();
  const thisMonth = new Date(2026, 8, 5, 12).getTime();
  const priorYear = new Date(2025, 11, 31, 12).getTime();
  const future = new Date(2026, 9, 1, 12).getTime();
  const sessions = [session(january), session(thisMonth, 120_000), session(priorYear), session(future)];

  const year = buildYearSummary(sessions, now);
  assert.equal(year.sessionCount, 2);
  assert.equal(year.focusedMs, 180_000);

  const overall = buildOverallSummary(sessions, now);
  assert.equal(overall.sessionCount, 3);
  assert.equal(overall.focusedMs, 240_000);

  const viewModel = buildAnalyticsViewModel(sessions, now);
  assert.equal(viewModel.year.sessionCount, 2);
  assert.equal(viewModel.overall.sessionCount, 3);
});
