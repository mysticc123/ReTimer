/**
 * Deterministic wall-clock control for timer tests.
 *
 * The store and screens read time exclusively via `Date.now()`, so
 * overriding it gives fully deterministic timestamp tests with no sleeps.
 */

const realNow = Date.now;

/** Pin `Date.now()` to a fixed millisecond timestamp. */
export function setNow(ms: number): void {
  Date.now = () => ms;
}

/** Move the pinned clock forward by `ms` milliseconds. */
export function advance(ms: number): void {
  const current = Date.now();
  Date.now = () => current + ms;
}

/** Restore the real clock. Always call in `afterEach`. */
export function restore(): void {
  Date.now = realNow;
}
