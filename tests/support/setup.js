/**
 * Spec setup.
 *
 * `globals: false` means Testing Library cannot register its own auto-cleanup, so
 * unmounting between component specs is registered here explicitly — without it a
 * page rendered by an earlier spec stays mounted and queries find more than one.
 */
import { afterEach, beforeEach } from 'vitest';

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
  // The panel keeps an accumulated per-session ledger in browser storage, so each
  // spec starts from an empty store instead of the previous spec's jobs.
  beforeEach(() => {
    window.localStorage.clear();
  });
}
