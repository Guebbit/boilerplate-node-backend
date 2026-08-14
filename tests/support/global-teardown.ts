import { rm } from 'node:fs/promises';
import { instanceDataRoot, type ITestGlobals } from './global-setup';

/**
 * Runs once per jest instance, after the last worker exits.
 *
 * Stops the shared in-memory Mongo that {@link globalSetup} started, then deletes only this
 * instance's data root — see the note in `global-setup.ts` for why per-instance ownership is the
 * whole cleanup story, and why a killed instance is swept by the NEXT run rather than by this one.
 *
 * Best-effort throughout: a failure to stop a server or remove temp files is never a reason to fail
 * a run that has already finished. The server dies with the process regardless; this only makes it
 * prompt.
 */
const globalTeardown = async () => {
    await (globalThis as ITestGlobals).__testMongoServer?.stop().catch(() => {});
    await rm(instanceDataRoot(), { recursive: true, force: true }).catch(() => {});
};

export default globalTeardown;
