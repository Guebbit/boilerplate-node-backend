import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where this jest instance's in-memory Mongo data directories live.
 *
 * `mongodb-memory-server` defaults to `mkdtemp(os.tmpdir()/mongo-mem-)`, and each server costs
 * ~201 MB of `dbpath` that only `MongoMemoryServer.stop()` removes. A killed worker never reaches
 * `stop()` — which is Stryker's normal operating mode, since it SIGKILLs a worker per timed-out
 * mutant — so the strandings accumulate in the system temp directory. On a tmpfs `/tmp` that is
 * 201 MB of RAM apiece, and once it fills, everything on the machine that writes to `/tmp` starts
 * failing with ENOSPC.
 *
 * The fix is ownership, not detection. Each jest instance gets its own directory under the repo,
 * named for its pid, and deletes exactly that directory when it finishes ({@link globalTeardown}).
 * Nothing has to work out whether a directory belongs to a live server, because no instance can
 * see another's. Detecting that instead — parsing `mongod.lock`, probing pids with
 * `process.kill(pid, 0)`, telling EPERM from ESRCH, applying age thresholds — answers a question
 * that does not arise once each run owns its own root.
 *
 * A SIGKILLed instance still leaves its directory behind. It lands in the repo's gitignored
 * `.tmp/`, where `npm run test:mutation` clears the lot before it starts and `rm -rf .tmp` is the
 * whole recovery procedure — rather than in a shared `/tmp` where it competes with the rest of
 * the machine.
 */
export const TEST_TMP_ROOT = path.join(__dirname, '..', '..', '.tmp');

/** This instance's own slice of it. Read by `database.ts` when it starts a server. */
export const instanceDataRoot = (): string =>
    path.join(TEST_TMP_ROOT, 'mongo', String(process.pid));

/**
 * Runs once per jest instance, before any worker starts.
 *
 * The path goes on `process.env` because `globalSetup` runs in the main process while the servers
 * are created in workers, and the environment is what crosses that boundary.
 */
const globalSetup = async () => {
    const root = instanceDataRoot();
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    process.env.NODE_TEST_MONGO_ROOT = root;
};

export default globalSetup;
