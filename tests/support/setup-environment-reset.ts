/**
 * @module
 * Per-test-file bootstrap: every case starts with the environment overrides its file began with.
 *
 * Why:   an override left in place leaks into every later case, and the case that fails is not
 *        the one that set it. Resetting here makes "restore after" something a test cannot forget.
 * Marks: whatever is overridden by now (the file sandbox's directories) is the starting point.
 *
 * A `setupFilesAfterEnv` entry, listed AFTER `setup-file-sandbox.ts`, so the sandbox is marked.
 */

import { markEnvironmentOverrides, resetEnvironmentOverrides } from '@infrastructure/config/store';
import { restoreProcessEnvironment } from './environment';

markEnvironmentOverrides();

/** Jest: runs after every case in the file, in whichever `describe` it sits. */
afterEach(() => {
    resetEnvironmentOverrides();
    restoreProcessEnvironment();
});
