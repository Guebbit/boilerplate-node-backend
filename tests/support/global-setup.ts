import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
// A relative path, not the `@infrastructure` alias every other file in this directory uses:
// `globalSetup` is loaded outside jest's normal module resolution, where `moduleNameMapper` does
// not apply — the alias resolves at `tsc`/`eslint` time but fails at jest's own runtime.
import { logger } from '../../src/infrastructure/adapters/logger';
import { usePreinstalledMongodBinary } from '../../src/infrastructure/runtime/mongodb-memory-binary';

/**
 * The one handle `globalSetup` has to hand `globalTeardown`. Jest runs both in the same process but
 * as separate modules, so `globalThis` is the only channel — `process.env` carries strings only.
 */
export interface TestGlobals {
    __testMongoServer?: MongoMemoryServer;
}

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
export const TEST_TMP_ROOT =
    process.env.NODE_TEST_TMP_BASE?.trim() || path.join(__dirname, '..', '..', '.tmp');

/** This instance's own slice of it, holding the one server {@link globalSetup} starts. */
export const instanceDataRoot = (): string =>
    path.join(TEST_TMP_ROOT, 'mongo', String(process.pid));

/**
 * How long `MongoMemoryServer.create()` gets before its stall is treated as a hang rather than a
 * slow first-time download.
 *
 * `mongodb-memory-server`'s own lock around `~/.cache/mongodb-binaries` (shared machine-wide, not
 * owned by this repo) has no timeout of its own: it polls every 3s for a pid it read from the lock
 * file to die. If that pid belonged to a process that was killed rather than exited — an OOM, a
 * Stryker worker SIGKILL, a cancelled session — and the number has since been reused by anything
 * else on the machine, the wait never ends, silently, with no test output at all.
 */
const CREATE_SERVER_TIMEOUT_MS = 120_000;

/**
 * Starts the server, giving up after {@link CREATE_SERVER_TIMEOUT_MS} rather than stalling silently.
 *
 * The loser of the race is CANCELLED, not abandoned. A bare `setTimeout` inside a `Promise.race`
 * keeps running after the race settles, and a pending timer holds jest's event loop open: the run
 * finishes, then sits there for the full two minutes before the process exits. `clearTimeout` in
 * `finally` is what keeps the guard from costing more than the hang it guards against.
 *
 * Exits rather than throws, because `mongodb-memory-server`'s lock-poll `setInterval` would keep
 * the loop alive past the rejection anyway — reporting the error and then hanging is not better
 * than hanging.
 *
 * @param dbPath - the data directory the server should use; must already exist
 * @returns the started server
 */
const createServer = (dbPath: string): Promise<MongoMemoryServer> => {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () =>
                reject(
                    new Error(
                        `MongoMemoryServer did not start within ${CREATE_SERVER_TIMEOUT_MS}ms. ` +
                            'This is a stall, not a slow download — check for a stale lock file ' +
                            'under ~/.cache/mongodb-binaries/ and delete it.'
                    )
                ),
            CREATE_SERVER_TIMEOUT_MS
        );
    });

    return Promise.race([MongoMemoryServer.create({ instance: { dbPath } }), timeout])
        .catch((error: unknown) => {
            logger.error(error);
            process.exit(1);
        })
        .finally(() => clearTimeout(timer));
};

/**
 * Whether a pid is still running.
 *
 * Signal `0` performs the permission and existence checks without delivering anything. `ESRCH`
 * means no such process; `EPERM` means it exists but belongs to someone else, which still counts
 * as alive — treating it as dead is how you delete a live server's data directory.
 */
const isAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
};

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
            .filter((entry) => Number(entry) !== process.pid && !isAlive(Number(entry)))
            .map((entry) =>
                rm(path.join(mongoRoot, entry), { recursive: true, force: true }).catch(() => {})
            )
    );
};

/**
 * Runs once per jest instance, before any worker starts.
 *
 * ── IT STARTS THE ONE DATABASE SERVER ────────────────────────────────────────────────────────────
 * Every suite that needs Mongo takes its own DATABASE on this single server, rather than starting a
 * server of its own — see `database.ts` for why that distinction is worth a shared global. A server
 * costs a real `mongod` process and ~200 MB of dbpath; a database on an existing server costs
 * nothing measurable.
 *
 * Both the uri and the data root travel on `process.env`, because this runs in the main process
 * while the connections are made in workers, and the environment is what crosses that boundary. The
 * server handle cannot travel that way, so it goes on `globalThis` for {@link globalTeardown},
 * which jest runs in this same process.
 */
const globalSetup = async () => {
    // Must run HERE, in the main process, and not in `setup.ts`: the env vars it sets are read by
    // `MongoMemoryServer.create()` below, and `setup.ts` runs per worker — after this server has
    // already started, in a process that cannot reach it.
    usePreinstalledMongodBinary();

    const root = instanceDataRoot();
    await sweepDeadInstances(path.join(TEST_TMP_ROOT, 'mongo'));
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    process.env.NODE_TEST_MONGO_ROOT = root;

    // `dbPath` must already exist — mongodb-memory-server reads the directory before starting
    const dbPath = path.join(root, 'server');
    await mkdir(dbPath, { recursive: true });

    const server = await createServer(dbPath);
    process.env.NODE_TEST_MONGO_URI = server.getUri();
    (globalThis as TestGlobals).__testMongoServer = server;
};

export default globalSetup;
