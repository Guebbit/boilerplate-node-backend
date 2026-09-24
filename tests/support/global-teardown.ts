import { rm } from 'node:fs/promises';
import { describeLeftovers, leftoverFiles } from './file-sandbox';
import { instanceDataRoot, instanceFilesRoot, type TestGlobals } from './global-setup';

/**
 * Runs once per jest instance, after the last worker exits.
 *
 * Stops the shared in-memory Mongo that {@link globalSetup} started, then deletes only this
 * instance's roots — see the note in `global-setup.ts` for why per-instance ownership is the whole
 * cleanup story, and why a killed instance is swept by the NEXT run rather than by this one.
 *
 * Best-effort, except for one deliberate failure:
 * - stopping the server and removing temp files never fails a run that has already finished.
 * - a file left in the sandbox does. It is removed first, so the machine stays clean either way,
 *   and the error names the test file that must clean up after itself — `file-sandbox.ts`.
 *
 * @throws {Error} when any test file left files in its sandbox
 */
const globalTeardown = async () => {
    await (globalThis as TestGlobals).__testMongoServer?.stop().catch(() => {});
    await rm(instanceDataRoot(), { recursive: true, force: true }).catch(() => {});

    const leftovers = await leftoverFiles(instanceFilesRoot());
    await rm(instanceFilesRoot(), { recursive: true, force: true }).catch(() => {});

    if (leftovers.length > 0) throw new Error(describeLeftovers(leftovers));
};

export default globalTeardown;
