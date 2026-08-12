import { rm } from 'node:fs/promises';
import { instanceDataRoot } from './global-setup';

/**
 * Runs once per jest instance, after the last worker exits.
 *
 * Deletes only this instance's data root — see the note in `global-setup.ts` for why that is the
 * whole cleanup story, and why concurrent Stryker instances cannot interfere with each other.
 * Best-effort: a failure to remove temp files is never a reason to fail a run that has already
 * finished.
 */
const globalTeardown = async () => {
    await rm(instanceDataRoot(), { recursive: true, force: true }).catch(() => {});
};

export default globalTeardown;
