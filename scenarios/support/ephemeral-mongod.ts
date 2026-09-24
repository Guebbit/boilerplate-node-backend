/**
 * @module
 * Actually starts an in-process `mongod` — the half of `startEphemeralMongo` (`./ephemeral-mongo.ts`)
 * that must stay out of `src/`, because `mongodb-memory-server` is a devDependency and
 * `not-to-dev-dep` bars `src/` from reaching one.
 *
 * Shared by `scenarios/run-server.ts`, `tests/support/global-setup.ts` and
 * `tests/cluster/support/cluster.ts` — `tests/` may import `scenarios/`, so one copy serves all
 * three rather than `run-server.ts` keeping its own small one.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
// Relative, not the `@infrastructure` alias: loaded transitively from `tests/support/
// global-setup.ts`, which jest loads outside its normal module resolution — `moduleNameMapper`
// does not apply there, so the alias would resolve at `tsc`/`eslint` time and fail at runtime.
import { logger } from '../../src/infrastructure/adapters/logger';
import type { EphemeralMongo } from './ephemeral-mongo';

/**
 * How long `MongoMemoryServer.create()` gets before its stall is treated as a hang rather than a
 * slow first-time download.
 *
 * `mongodb-memory-server`'s own lock around `~/.cache/mongodb-binaries` (shared machine-wide, not
 * owned by this repo) has no timeout of its own: it polls every 3s for a pid it read from the lock
 * file to die. If that pid belonged to a process that was killed rather than exited — an OOM, a
 * Stryker worker SIGKILL, a cancelled session — and the number has since been reused by anything
 * else on the machine, the wait never ends, silently, with no output at all.
 */
const CREATE_SERVER_TIMEOUT_MS = 120_000;

/** Adapts a real `MongoMemoryServer` to the shape every caller here depends on instead. */
const toEphemeralMongo = (server: MongoMemoryServer): EphemeralMongo => ({
    uri: server.getUri(),
    stop: () => server.stop().then(() => undefined)
});

/**
 * Starts an in-process `mongod`, giving up after {@link CREATE_SERVER_TIMEOUT_MS} rather than
 * stalling silently.
 *
 * The loser of the race is CANCELLED, not abandoned: a bare `setTimeout` inside a `Promise.race`
 * keeps running after the race settles, and a pending timer holds the event loop open. `clearTimeout`
 * in `finally` is what keeps the guard from costing more than the hang it guards against.
 *
 * Exits rather than rejects on failure, timeout included: `mongodb-memory-server`'s own lock-poll
 * `setInterval` keeps running past a timeout's rejection regardless — reporting the error and then
 * hanging on that interval is not better than hanging outright.
 *
 * @param databasePath - where the server keeps its data; a temp directory of the library's own choosing
 * when omitted.
 */
export const startInProcessMongod = (databasePath: string | undefined): Promise<EphemeralMongo> => {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () =>
                reject(
                    new Error(
                        `mongodb-memory-server did not start within ${String(CREATE_SERVER_TIMEOUT_MS)}ms. ` +
                            'This is a stall, not a slow download — check for a stale lock file ' +
                            'under ~/.cache/mongodb-binaries/ and delete it.'
                    )
                ),
            CREATE_SERVER_TIMEOUT_MS
        );
    });

    // `mongodb-memory-server`: starts a real `mongod` against `databasePath` (or a temp directory of its
    // own choosing when omitted) and returns a handle exposing its connection string and `stop()`.
    // https://typegoose.github.io/mongodb-memory-server/
    return Promise.race([
        MongoMemoryServer.create(databasePath ? { instance: { dbPath: databasePath } } : undefined),
        timeout
    ])
        .then(toEphemeralMongo)
        .catch((error: unknown) => {
            logger.error(error);
            return process.exit(1);
        })
        .finally(() => clearTimeout(timer));
};
