/**
 * @module
 * Per-test-file bootstrap: a warning nobody declared fails the case that caused it.
 *
 * Why:   a deprecation, a leaked listener or a driver warning is a finding. Printed to a green run
 *        it is read by nobody, and it is cheapest to fix the day it first appears.
 * Scope: `console.warn`, `console.error` and `process` `'warning'` events (forwarded in by
 *        `test-environment.ts`); see `expect-warning.ts` for how a case declares one it expects.
 *
 * A `setupFilesAfterEnv` entry: it needs jest's `beforeEach` / `afterEach` globals.
 */

import { warnings } from './expect-warning';

/**
 * Node's real `process.nextTick`, taken at load. Fake timers replace the sandbox's copy, and a
 * faked tick would never run.
 */
const { nextTick } = process;

/**
 * Lets Node deliver the warnings already emitted: it queues each one on the next tick, so without
 * this a warning lands on the case that follows the one that caused it.
 * https://nodejs.org/api/process.html#processemitwarningwarning-options
 *
 * @returns a promise that settles after one real tick
 */
const flushPendingWarnings = (): Promise<void> =>
    new Promise((resolve) => {
        nextTick(resolve);
    });

/** Jest: before every case, drop what the last one left in flight, then watch with an empty slate. */
beforeEach(() =>
    flushPendingWarnings().then(() => {
        warnings.start();
    })
);

/** Jest: after every case, let in-flight warnings land, then fail on what was not declared. */
afterEach(() =>
    flushPendingWarnings().then(() => {
        warnings.finish();
    })
);
