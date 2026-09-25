/**
 * Monthly calendar layout — deterministic column math.
 *
 * The monthly grid must render exactly CALENDAR_COLUMNS equal cells per row.
 * The cell size is computed from the known width chain (screen padding ->
 * card border -> grid padding -> per-cell margins) so 7 cells + margins always
 * fit the available width, and any narrower screen never overflows.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_COLUMNS, computeCalendarCellSize } from '../src/utils/calendarLayout';

// Matches the values wired in AnalyticsScreen: scrollContent padding =
// spacing.lg (24), chartCard borderWidth 1, monthGrid padding = spacing.sm (8),
// monthCell margin 1.
const BASE = {
  contentPadding: 24,
  containerBorderWidth: 1,
  gridPadding: 8,
  cellMargin: 1,
} as const;

function available(screenWidth: number): number {
  return (
    screenWidth -
    BASE.contentPadding * 2 -
    BASE.containerBorderWidth * 2 -
    BASE.gridPadding * 2
  );
}

describe('Monthly calendar layout', () => {
  it('cell size is a whole number that fits the available width', () => {
    const screenWidth = 411.4; // Pixel 8 portrait, dp
    const cellSize = computeCalendarCellSize({ screenWidth, ...BASE });
    const occupied = cellSize * CALENDAR_COLUMNS + CALENDAR_COLUMNS * BASE.cellMargin * 2;
    assert.ok(Number.isInteger(cellSize));
    assert.ok(occupied <= available(screenWidth));
    assert.equal(cellSize, 47);
  });

  it('7 equal cells plus margins occupy less than the grid width at every common screen size', () => {
    const widths = [320, 360, 393, 411.4, 428, 480, 800, 900];
    for (const screenWidth of widths) {
      const cellSize = computeCalendarCellSize({ screenWidth, ...BASE });
      const occupied = cellSize * CALENDAR_COLUMNS + CALENDAR_COLUMNS * BASE.cellMargin * 2;
      assert.ok(occupied <= available(screenWidth), `screen ${screenWidth}: 7 cells overflow`);
    }
  });

  it('scales monotonically with screen width', () => {
    const narrow = computeCalendarCellSize({ screenWidth: 320, ...BASE });
    const wide = computeCalendarCellSize({ screenWidth: 900, ...BASE });
    assert.ok(wide > narrow);
  });

  it('never returns a negative size on a too-narrow screen', () => {
    assert.ok(computeCalendarCellSize({ screenWidth: 40, ...BASE }) >= 0);
  });
});