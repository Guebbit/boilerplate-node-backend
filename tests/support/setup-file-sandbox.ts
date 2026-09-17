/**
 * @module
 * Per-test-file bootstrap: redirects the application's file writes into this file's sandbox.
 *
 * A `setupFilesAfterEnv` entry rather than part of `setup.ts`: only here does jest already know
 * which test file is about to run, and the sandbox is named after it. See `file-sandbox.ts`.
 */

import { applyFileSandbox } from './file-sandbox';

/**
 * Jest: the path of the test file this setup runs for.
 * https://jestjs.io/docs/expect#expectgetstate
 */
applyFileSandbox(expect.getState().testPath);
