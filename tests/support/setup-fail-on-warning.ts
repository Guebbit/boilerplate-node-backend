/**
 * @module
 * Per-test-file bootstrap: a warning nobody declared fails the case that caused it.
 *
 * Why:   a deprecation, a leaked listener or a driver warning is a finding. Printed to a green run
 *        it is read by nobody, and it is cheapest to fix the day it first appears.
 * Scope: `console.warn`, `console.error` and `process` `'warning'` events; see `expect-warning.ts`
 *        for how a case declares one it expects.
 *
 * A `setupFilesAfterEnv` entry: it needs jest's `beforeEach` / `afterEach` globals.
 */

import { warnings } from './expect-warning';

/** Jest: before every case, begin watching with an empty slate. */
beforeEach(() => {
    warnings.start();
});

/** Jest: after every case, fail on what was not declared. Last-registered hooks run first. */
afterEach(() => {
    warnings.finish();
});
