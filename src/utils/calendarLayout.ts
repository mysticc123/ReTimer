/**
 * Deterministic 7-column calendar layout.
 *
 * The monthly grid renders Monday..Sunday cells inside a card that sits in a
 * padded screen. Instead of relying on `flex: 1` + `aspectRatio` (which can
 * collapse to tiny widths inside a flex-wrap row), the cell size is computed
 * explicitly from the known width chain so every row contains exactly 7 equal
 * columns and the weekday header aligns column-for-column with the date cells.
 */

export const CALENDAR_COLUMNS = 7;

export interface CalendarLayoutParams {
  /** Available screen width in dp (window width). */
  screenWidth: number;
  /** Horizontal padding on each side of the screen content. */
  contentPadding: number;
  /** Border width of the card that wraps the grid. */
  containerBorderWidth: number;
  /** Padding on each side of the grid itself. */
  gridPadding: number;
  /** Per-side margin applied to every cell (creates the gutters). */
  cellMargin: number;
  /** Number of columns (defaults to a Monday..Sunday week). */
  columns?: number;
}

/**
 * Returns the equal width (and height) in dp for each calendar cell so that
 * `columns` cells plus their margins fit within the available width.
 * The value is floored to whole dp so exact pixel rounding never overflows.
 */
export function computeCalendarCellSize(params: CalendarLayoutParams): number {
  const {
    screenWidth,
    contentPadding,
    containerBorderWidth,
    gridPadding,
    cellMargin,
    columns = CALENDAR_COLUMNS,
  } = params;

  const available =
    screenWidth -
    contentPadding * 2 -
    containerBorderWidth * 2 -
    gridPadding * 2 -
    columns * cellMargin * 2;

  return Math.max(0, Math.floor(available / columns));
}