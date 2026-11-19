import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
/**
 * Relative paths, not the `@infrastructure`/`@tests` aliases every other file in this directory
 * uses: `globalSetup` is loaded outside jest's normal module resolution, where `moduleNameMapper`
 * does not apply — an alias resolves at `tsc`/`eslint` time but fails at jest's own runtime.
 */
import { startEphemeralMongo, type EphemeralMongo } from '../../scenarios/support/ephemeral-mongo';
import { startInProcessMongod } from '../../scenarios/support/ephemeral-mongod';
import { FILE_SANDBOX_ROOT_VARIABLE } from './file-sandbox';
import { isProcessAlive } from './process-alive';

/**
 * The one handle `globalSetup` has to hand `globalTeardown`. Jest runs both in the same process but
 * as separate modules, so `globalThis` is the only channel — `process.env` carries strings only.
 */
export interface TestGlobals {
    /** The one in-memory Mongo of the run; set here, read and stopped by global teardown. */
    __testMongoServer?: EphemeralMongo;
}

/**
 * Where this jest instance's in-memory Mongo data directories live.
 *
 * Problem:   `mongodb-memory-server` defaults to `mkdtemp(os.tmpdir()/mongo-mem-)`, ~201 MB of
 *            `dbpath` per server that only `MongoMemoryServer.stop()` removes. A killed worker
 *            never reaches `stop()` (Stryker SIGKILLs one per timed-out mutant), so strandings
 *            pile up in the system temp. On a tmpfs `/tmp` that is 201 MB of RAM apiece, until
 *            everything writing to `/tmp` fails with ENOSPC.
 * Fix:       ownership, not detection. Each instance gets its own directory under the repo, named
 *            for its pid, and deletes exactly that one ({@link globalTeardown}). No instance sees
 *            another's, so nobody works out WHOSE stray directory it is. What remains is "is the
 *            pid a directory is named for still running", which {@link isProcessAlive} answers with
 *            `process.kill(pid, 0)`; no `mongod.lock` parsing, no age thresholds.
 * Leftover:  a SIGKILLed instance leaves its directory in the gitignored `tmp/test/`. Every
 *            mutation entry point (`scripts/mutation/stryker-run.ts`) clears it first, and
 *            `rm -rf tmp/test` is the whole recovery.
 * Scope:     `tmp/test/`, not all of `tmp/`, so the sweep never touches `tmp/reports/`, where
 *            Stryker's incremental cache lives and must be READ at that moment.
 */
export const TEST_TMP_ROOT =
    process.env.NODE_TEST_TMP_BASE?.trim() || path.join(__dirname, '..', '..', 'tmp', 'test');

/** This instance's own slice of it, holding the one server {@link globalSetup} starts. */
export const instanceDataRoot = (): string =>
    path.join(TEST_TMP_ROOT, 'mongo', String(process.pid));

/** This instance's file sandbox root, one directory per test file beneath it — `file-sandbox.ts`. */
export const instanceFilesRoot = (): string =>
    path.join(TEST_TMP_ROOT, 'files', String(process.pid));

/**
 * Deletes the data roots of instances that are no longer running.
 *
 * Ownership by pid is enough to clean up after a CLEAN exit, because {@link globalTeardown} runs.
 * It is not enough under Stryker, which starts a new jest instance per restarted test-runner
 * worker and SIGKILLs the previous one: teardown never runs, the dead instance's ~200 MB stays,
 * and the next instance takes a new pid and a new directory beside it. Left alone that grows
 * without bound inside a single run — 212 directories and 71 GB, measured 2026-08-14.
 *
 * A directory named for a pid that no longer exists cannot belong to a live server, so removing it
 * is safe without inspecting `mongod.lock` or reasoning about age. Own-pid is skipped because
 * {@link globalSetup} is about to create it.
 */
const sweepDeadInstances = async (mongoRoot: string): Promise<void> => {
    const entries = await readdir(mongoRoot).catch(() => [] as string[]);

    await Promise.all(
        entries
            .filter((entry) => /^\d+$/.test(entry))
            .filter((entry) => Number(entry) !== process.pid && !isProcessAlive(Number(entry)))
            .map((entry) =>
                rm(path.join(mongoRoot, entry), { recursive: true, force: true }).catch(() => {})
            )
    );
};

/**
 * Gives this instance a fresh, empty root of its own, after sweeping dead instances' roots beside it.
 *
 * @param root - one of {@link instanceDataRoot} or {@link instanceFilesRoot}
 * @returns the same root, now existing and empty
 */
const claimInstanceRoot = async (root: string): Promise<string> => {
    await sweepDeadInstances(path.dirname(root));
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    return root;
};

/**
 * Runs once per jest instance, before any worker starts.
 *
 * Database: starts the ONE server. Every suite that needs Mongo takes its own DATABASE on it
 *           instead of starting a server (`database.ts` says why that is worth a shared global): a
 *           server is a real `mongod` and ~200 MB of dbpath, a database on an existing one costs
 *           nothing measurable.
 * Channel:  the uri and data root travel on `process.env`, since this runs in the main process and
 *           connections are made in workers. The server handle cannot, so it goes on `globalThis`
 *           for {@link globalTeardown}, which jest runs in this same process.
 * Sandbox:  claims the root every test file's writes are redirected under, published the same way
 *           (`file-sandbox.ts`).
 */
const globalSetup = async () => {
    /**
     * `logger.ts` is on this file's import chain and pseudonymises personal fields; `setup-environment`
     * has not run in this process, and the pseudonymisation root has no built-in fallback.
     */
    process.env.NODE_PSEUDONYM_KEY ??= 'test-pseudonym-key-for-the-suite';

    process.env[FILE_SANDBOX_ROOT_VARIABLE] = await claimInstanceRoot(instanceFilesRoot());

    const root = await claimInstanceRoot(instanceDataRoot());
    process.env.NODE_TEST_MONGO_ROOT = root;

    /**
     * `dbPath` must already exist — mongodb-memory-server reads the directory before starting.
     * Ignored when `NODE_TEST_MONGO_URI` is already set: `startEphemeralMongo` then skips starting
     * one at all.
     */
    const dbPath = path.join(root, 'server');
    await mkdir(dbPath, { recursive: true });

    const server = await startEphemeralMongo({ dbPath, startInProcess: startInProcessMongod });
    process.env.NODE_TEST_MONGO_URI = server.uri;
    (globalThis as TestGlobals).__testMongoServer = server;
};

/** Jest `globalSetup`: the module's default export, as the jest config expects. */
export default globalSetup;
