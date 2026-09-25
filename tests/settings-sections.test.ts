/**
 * Settings screen composition + preserved behavior (Settings UX cleanup pass).
 *
 * The Settings screen was reorganized: HAPTICS / COUNTDOWN / DAILY FOCUS GOAL
 * were consolidated into a single GENERAL section, the POMODORO section was
 * removed in favor of the editors that already live on the Landing screen, and
 * the Text Size block was compacted. None of that may change behavior, so this
 * suite locks in both halves:
 *
 * - Structure: which sections exist, in which order, and which rows each one
 *   owns, asserted from the screen's own source. The test harness compiles and
 *   runs logic-level modules only (no renderer, no react-test-renderer), so
 *   source inspection is what can actually catch a UI reorganization.
 * - Behavior: the settings behind the GENERAL rows, the Landing Pomodoro
 *   editors, persistence, and the untouched Text Size / Reduced Motion /
 *   Sound Type defaults, all asserted through the real store.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadStores, relaunch, mmkvMock } from './helpers/stores.js';
import type { LoadedApp } from './helpers/stores.js';

const SETTINGS_KEY = 'retimer-settings';

function readSource(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');
}

const settingsSource = readSource('screens', 'SettingsScreen.tsx');
const landingSource = readSource('screens', 'LandingScreen.tsx');

interface Section {
  name: string;
  body: string;
}

/**
 * Split a screen into its `{/* Name Section *\/}` blocks. Each block runs from
 * its own marker to the next marker, so a section owns exactly the JSX between
 * two headers — which is what "row X moved into section Y" means in practice.
 */
function parseSections(source: string): Section[] {
  const marker = /\{\s*\/\*\s*([^*]+?)\s+Section\s*\*\/\s*\}/g;
  const found: { name: string; start: number; end: number }[] = [];
  let match = marker.exec(source);
  while (match !== null) {
    found.push({ name: match[1].trim(), start: match.index, end: source.length });
    match = marker.exec(source);
  }
  for (let index = 0; index < found.length - 1; index += 1) {
    found[index].end = found[index + 1].start;
  }
  return found.map((entry) => ({
    name: entry.name,
    body: source.slice(entry.start, entry.end),
  }));
}

const sections = parseSections(settingsSource);
const sectionNames = sections.map((section) => section.name);

function section(name: string): Section {
  const found = sections.find((entry) => entry.name === name);
  assert.ok(found, `expected a "${name}" section, saw ${sectionNames.join(', ')}`);
  return found;
}

function readSettings(app: LoadedApp): Record<string, unknown> {
  return app.useSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
}

describe('Settings screen section structure', () => {
  it('exposes exactly the consolidated section set, in order', () => {
    assert.deepEqual(sectionNames, [
      'Appearance',
      'Sound & Haptics',
      'Goals',
      'Timer Behavior',
      'Display',
      'Notifications',
    ]);
  });

  it('renders each section header with its own title text', () => {
    for (const entry of sections) {
      const rendered = new RegExp(
        `>\\s*${entry.name.replace(/ /g, '\\s+')}\\s*<\\/Text>`
      );
      assert.match(entry.body, rendered, `"${entry.name}" header text is rendered`);
    }
  });

  it('no longer renders the old Haptics / Countdown / Daily Focus Goal / General headers', () => {
    for (const gone of ['Haptics', 'Countdown', 'Daily Focus Goal', 'General']) {
      assert.ok(
        !sectionNames.includes(gone),
        `expected no "${gone}" section`
      );
    }
    // The old headers must not survive as bare rendered text either.
    for (const gone of ['Haptics', 'Countdown', 'Daily Focus Goal', 'General']) {
      assert.ok(
        !new RegExp(`>\\s*${gone}\\s*<\\/Text>`).test(settingsSource),
        `expected no rendered "${gone}" header text`
      );
    }
  });

  it('Sound & Haptics owns Completion Sound, Sound Type, and Haptic Feedback', () => {
    const body = section('Sound & Haptics').body;
    assert.match(body, /label="Completion Sound"/);
    assert.match(body, /label="Sound Type"/);
    assert.match(body, /label="Haptic Feedback"/);
    assert.match(body, /settings\.soundEnabled/);
    assert.match(body, /Sound type,/);
    assert.match(body, /settings\.hapticsEnabled/);
    // Sound & Haptics must not absorb other rows.
    for (const foreign of ['Daily Target', 'Keep Screen Awake', 'Fullscreen Mode']) {
      assert.ok(
        !body.includes(foreign),
        `Sound & Haptics must not own "${foreign}"`
      );
    }
  });

  it('Goals owns Daily Target', () => {
    const body = section('Goals').body;
    assert.match(body, /label="Daily Target"/);
    assert.match(body, /settings\.dailyFocusGoalMs/);
    assert.match(body, /showDivider={false}/);
  });

  it('Timer Behavior owns Repeat', () => {
    const body = section('Timer Behavior').body;
    assert.match(body, /label="Repeat"/);
    assert.match(body, /settings\.timerCompletionBehavior === 'repeat'/);
    assert.match(body, /showDivider={false}/);
  });

  it('Appearance still owns Theme, Accent Color, Font, and Text Size', () => {
    const body = section('Appearance').body;
    assert.match(body, /label="Theme"/);
    assert.match(body, /label="Accent Color"/);
    assert.match(body, /label="Font"/);
    assert.match(body, /Text Size/);
  });

  it('Display still owns Keep Screen Awake, Fullscreen Mode, Reduced Motion', () => {
    const body = section('Display').body;
    assert.match(body, /label="Keep Screen Awake"/);
    assert.match(body, /label="Fullscreen Mode"/);
    assert.match(body, /label="Reduced Motion"/);
  });
});

describe('Pomodoro configuration ownership', () => {
  it('Settings no longer exposes any Pomodoro setting', () => {
    assert.ok(
      !/pomodoro/i.test(settingsSource),
      'SettingsScreen must not reference any pomodoro setting'
    );
    assert.ok(
      !sectionNames.includes('Pomodoro'),
      'Settings must not render a Pomodoro section'
    );
  });

  it('Landing still exposes all four Pomodoro editors', () => {
    for (const key of [
      'pomodoroFocusMs',
      'pomodoroBreakMs',
      'pomodoroLongBreakMs',
      'pomodoroSessionsBeforeLongBreak',
    ]) {
      assert.ok(
        landingSource.includes(`openDurationEditor('${key}'`),
        `Landing must keep the ${key} editor`
      );
    }
  });

  it('Pomodoro settings still drive the store from Landing edits', async () => {
    const app = await loadStores();
    const before = readSettings(app);
    app.useSettingsStore.getState().updateSettings({
      pomodoroFocusMs: 30 * 60 * 1000,
      pomodoroBreakMs: 7 * 60 * 1000,
      pomodoroLongBreakMs: 20 * 60 * 1000,
      pomodoroSessionsBeforeLongBreak: 6,
    });
    const after = readSettings(app);
    assert.equal(after['pomodoroFocusMs'], 30 * 60 * 1000);
    assert.equal(after['pomodoroBreakMs'], 7 * 60 * 1000);
    assert.equal(after['pomodoroLongBreakMs'], 20 * 60 * 1000);
    assert.equal(after['pomodoroSessionsBeforeLongBreak'], 6);
    // Unrelated values are untouched by a Pomodoro edit.
    assert.equal(after['hapticsEnabled'], before['hapticsEnabled']);
    assert.equal(after['dailyFocusGoalMs'], before['dailyFocusGoalMs']);
  });

  it('Pomodoro edits survive a relaunch even though Settings cannot make them', async () => {
    const app = await loadStores();
    app.useSettingsStore
      .getState()
      .updateSettings({ pomodoroFocusMs: 45 * 60 * 1000 });
    const relaunched = await relaunch();
    assert.equal(readSettings(relaunched)['pomodoroFocusMs'], 45 * 60 * 1000);
  });
});

describe('General settings behavior is unchanged', () => {
  beforeEach(async () => {
    await loadStores();
  });

  it('Haptic Feedback toggles both ways and persists', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({ hapticsEnabled: false });
    assert.equal(readSettings(app)['hapticsEnabled'], false);
    app.useSettingsStore.getState().updateSettings({ hapticsEnabled: true });
    assert.equal(readSettings(app)['hapticsEnabled'], true);
    const parsed = JSON.parse(
      mmkvMock().__readRaw(SETTINGS_KEY) as string
    ) as { state?: { settings?: Record<string, unknown> } };
    assert.equal(parsed.state?.settings?.['hapticsEnabled'], true);
  });

  it('Countdown Repeat maps to timerCompletionBehavior repeat/stop and persists', async () => {
    const app = await loadStores();
    assert.equal(readSettings(app)['timerCompletionBehavior'], 'stop');
    app.useSettingsStore.getState().updateSettings({
      timerCompletionBehavior: 'repeat',
    });
    assert.equal(readSettings(app)['timerCompletionBehavior'], 'repeat');
    const relaunched = await relaunch();
    assert.equal(
      readSettings(relaunched)['timerCompletionBehavior'],
      'repeat'
    );
    app.useSettingsStore.getState().updateSettings({
      timerCompletionBehavior: 'stop',
    });
    assert.equal(readSettings(app)['timerCompletionBehavior'], 'stop');
  });

  it('Daily Focus Goal updates, persists, and leaves Pomodoro values alone', async () => {
    const app = await loadStores();
    const focusBefore = readSettings(app)['pomodoroFocusMs'];
    app.useSettingsStore
      .getState()
      .updateSettings({ dailyFocusGoalMs: 3 * 60 * 60 * 1000 });
    assert.equal(readSettings(app)['dailyFocusGoalMs'], 3 * 60 * 60 * 1000);
    assert.equal(readSettings(app)['pomodoroFocusMs'], focusBefore);
    const relaunched = await relaunch();
    assert.equal(
      readSettings(relaunched)['dailyFocusGoalMs'],
      3 * 60 * 60 * 1000
    );
  });
});

describe('Untouched appearance / motion / sound settings', () => {
  beforeEach(async () => {
    await loadStores();
  });

  it('Text Size default and the whole step ladder are unchanged', async () => {
    const app = await loadStores();
    assert.equal(readSettings(app)['fontScale'], 1.0);
    const { FONT_SCALES } = await import('../src/utils/fontScale.js');
    assert.deepEqual([...FONT_SCALES], [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5]);
    // Every stop remains a usable, finite scale.
    for (const step of FONT_SCALES) {
      assert.ok(Number.isFinite(step) && step > 0, `step ${step} is valid`);
    }
  });

  it('Text Size selection persists across a relaunch', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({ fontScale: 1.4 });
    const relaunched = await relaunch();
    assert.equal(readSettings(relaunched)['fontScale'], 1.4);
  });

  it('Reduced Motion default is off and toggling persists', async () => {
    const app = await loadStores();
    assert.equal(readSettings(app)['reducedMotion'], false);
    app.useSettingsStore.getState().updateSettings({ reducedMotion: true });
    const relaunched = await relaunch();
    assert.equal(readSettings(relaunched)['reducedMotion'], true);
  });

  it('Sound Type default is gentle-chime and stays selectable', async () => {
    const app = await loadStores();
    assert.equal(readSettings(app)['completionSound'], 'gentle-chime');
    app.useSettingsStore
      .getState()
      .updateSettings({ completionSound: 'digital-beep' });
    assert.equal(readSettings(app)['completionSound'], 'digital-beep');
    const relaunched = await relaunch();
    assert.equal(readSettings(relaunched)['completionSound'], 'digital-beep');
  });

  it('General, appearance, and sound edits all persist together', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({
      hapticsEnabled: false,
      timerCompletionBehavior: 'repeat',
      dailyFocusGoalMs: 90 * 60 * 1000,
      fontScale: 1.2,
      reducedMotion: true,
      completionSound: 'digital-beep',
    });
    const relaunched = await relaunch();
    const settings = readSettings(relaunched);
    assert.equal(settings['hapticsEnabled'], false);
    assert.equal(settings['timerCompletionBehavior'], 'repeat');
    assert.equal(settings['dailyFocusGoalMs'], 90 * 60 * 1000);
    assert.equal(settings['fontScale'], 1.2);
    assert.equal(settings['reducedMotion'], true);
    assert.equal(settings['completionSound'], 'digital-beep');
  });
});

describe('Invalid or missing settings still fall back safely', () => {
  it('a persisted object missing every optional key rehydrates with defaults', async () => {
    await loadStores();
    mmkvMock()
      .createMMKV()
      .set(
        SETTINGS_KEY,
        JSON.stringify({
          state: { settings: { theme: 'light', hapticsEnabled: false } },
          version: 0,
        })
      );
    const app = await relaunch();
    const settings = readSettings(app);
    assert.equal(settings['theme'], 'light');
    assert.equal(settings['hapticsEnabled'], false);
    // Defaults fill every removed-from-Settings key too, so the Landing
    // editors never see undefined.
    assert.equal(settings['dailyFocusGoalMs'], 2 * 60 * 60 * 1000);
    assert.equal(settings['timerCompletionBehavior'], 'stop');
    assert.equal(settings['pomodoroFocusMs'], 25 * 60 * 1000);
    assert.equal(settings['pomodoroLongBreakMs'], 15 * 60 * 1000);
    assert.equal(settings['pomodoroSessionsBeforeLongBreak'], 4);
    assert.equal(settings['fontScale'], 1.0);
  });

  it('every numeric setting stays a finite number after the reorganization', async () => {
    const app = await loadStores();
    const settings = readSettings(app);
    for (const key of [
      'pomodoroFocusMs',
      'pomodoroBreakMs',
      'pomodoroLongBreakMs',
      'pomodoroSessionsBeforeLongBreak',
      'countdownDurationMs',
      'dailyFocusGoalMs',
      'fontScale',
    ]) {
      assert.equal(typeof settings[key], 'number', `${key} is a number`);
      assert.ok(
        Number.isFinite(settings[key] as number) &&
          !Number.isNaN(settings[key] as number),
        `${key} is finite`
      );
    }
  });

  it('resetSettings restores the full default set', async () => {
    const app = await loadStores();
    app.useSettingsStore.getState().updateSettings({
      hapticsEnabled: false,
      timerCompletionBehavior: 'repeat',
      dailyFocusGoalMs: 5 * 60 * 60 * 1000,
      pomodoroFocusMs: 50 * 60 * 1000,
      fontScale: 1.5,
    });
    app.useSettingsStore.getState().resetSettings();
    const settings = readSettings(app);
    assert.equal(settings['hapticsEnabled'], true);
    assert.equal(settings['timerCompletionBehavior'], 'stop');
    assert.equal(settings['dailyFocusGoalMs'], 2 * 60 * 60 * 1000);
    assert.equal(settings['pomodoroFocusMs'], 25 * 60 * 1000);
    assert.equal(settings['fontScale'], 1.0);
  });
});
