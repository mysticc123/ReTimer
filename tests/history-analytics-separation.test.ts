import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from './helpers/clock.js';
import { loadViewModel } from './helpers/analytics.js';
import { loadStores, relaunch, type LoadedApp } from './helpers/stores.js';

const T0 = 1_700_000_000_000;
const SESSION_MS = 25 * 60 * 1000;

function completeSession(app: LoadedApp, completedAtMs = T0): string {
  clock.setNow(completedAtMs);
  const timer = app.useTimerStore.getState();
  timer.initializeTimer('countdown', SESSION_MS);
  timer.startTimer();
  timer.completeTimer();
  return app.useTimerStore.getState().sessions.at(-1)!.id;
}

describe('History and Analytics persistence separation', () => {
  let app: LoadedApp;

  beforeEach(async () => {
    app = await loadStores();
    clock.setNow(T0);
  });

  afterEach(() => {
    clock.restore();
  });

  it('completing a session updates both History and Analytics', () => {
    const id = completeSession(app);

    assert.equal(app.useTimerStore.getState().sessions.length, 1);
    assert.equal(app.useAnalyticsStore.getState().sessions.length, 1);
    assert.equal(app.useAnalyticsStore.getState().sessions[0].id, id);
  });

  it('deleting one History item leaves Analytics unchanged', () => {
    completeSession(app);
    const analyticsBefore = app.useAnalyticsStore.getState().sessions;
    const id = app.useTimerStore.getState().sessions[0].id;

    app.useTimerStore.getState().deleteSessionHistoryItem(id);

    assert.deepEqual(app.useTimerStore.getState().sessions, []);
    assert.deepEqual(app.useAnalyticsStore.getState().sessions, analyticsBefore);
  });

  it('clearing all History leaves Analytics unchanged', () => {
    completeSession(app, T0);
    completeSession(app, T0 + 60_000);
    const analyticsBefore = app.useAnalyticsStore.getState().sessions;

    app.useTimerStore.getState().clearSessionHistory();

    assert.deepEqual(app.useTimerStore.getState().sessions, []);
    assert.deepEqual(app.useAnalyticsStore.getState().sessions, analyticsBefore);
  });

  it('continues accumulating Analytics after History is cleared', async () => {
    completeSession(app, T0);
    app.useTimerStore.getState().clearSessionHistory();
    completeSession(app, T0 + 60_000);

    const analytics = app.useAnalyticsStore.getState().sessions;
    assert.equal(app.useTimerStore.getState().sessions.length, 1);
    assert.equal(analytics.length, 2);
    assert.equal(analytics.reduce((sum, session) => sum + session.actualDurationMs, 0), 2 * SESSION_MS);

    const viewModel = await loadViewModel();
    const model = viewModel.buildAnalyticsViewModel(analytics, T0 + 60_000);
    assert.equal(model.week.sessionCount, 2);
    assert.equal(model.week.focusedMs, 2 * SESSION_MS);
  });

  it('persists History and Analytics independently across reload', async () => {
    completeSession(app);
    app.useTimerStore.getState().clearSessionHistory();

    app = await relaunch();

    assert.deepEqual(app.useTimerStore.getState().sessions, []);
    assert.equal(app.useAnalyticsStore.getState().sessions.length, 1);
    assert.equal(app.useAnalyticsStore.getState().sessions[0].actualDurationMs, SESSION_MS);
  });
});
