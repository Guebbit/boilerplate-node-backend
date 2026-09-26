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

import { MongoMemoryReplSet } from 'mongodb-memory-server';
// Relative, not the `@infrastructure` alias: loaded transitively from `tests/support/
// global-setup.ts`, which jest loads outside its normal module resolution — `moduleNameMapper`
// does not apply there, so the alias would resolve at `tsc`/`eslint` time and fail at runtime.
import { logger } from '../../src/infrastructure/adapters/logger';
import type { EphemeralMongo } from './ephemeral-mongo';

/**
 * How long `MongoMemoryReplSet.create()` gets before its stall is treated as a hang rather than a
 * slow first-time download.
 *
 * `mongodb-memory-server`'s own lock around `~/.cache/mongodb-binaries` (shared machine-wide, not
 * owned by this repo) has no timeout of its own: it polls every 3s for a pid it read from the lock
 * file to die. If that pid belonged to a process that was killed rather than exited — an OOM, a
 * Stryker worker SIGKILL, a cancelled session — and the number has since been reused by anything
 * else on the machine, the wait never ends, silently, with no output at all.
 */
const CREATE_SERVER_TIMEOUT_MS = 120_000;

/** Adapts a real `MongoMemoryReplSet` to the shape every caller here depends on instead. */
const toEphemeralMongo = (server: MongoMemoryReplSet): EphemeralMongo => ({
    uri: server.getUri(),
    stop: () => server.stop().then(() => undefined)
});

/**
 * Starts an in-process, single-member replica set rather than a standalone `mongod`.
 *
 * DDD-D2: multi-document transactions need a replica set even for a lone member — a standalone
 * `mongod` refuses `startTransaction()` outright. `count: 1` keeps the cost of that at nearly
 * nothing (no real replication, no extra network hops); `storageEngine: 'wiredTiger'` is explicit
 * because transactions require it and this library's own default only follows the mongod version.
 *
 * @param databasePath - where the sole member keeps its data; a temp directory of the library's
 * own choosing when omitted.
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

    // `mongodb-memory-server`: starts a real, one-member `mongod` replica set against
    // `databasePath` (or a temp directory of its own choosing when omitted) and returns a handle
    // exposing its connection string and `stop()`. https://typegoose.github.io/mongodb-memory-server/
    return Promise.race([
        MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' },
            instanceOpts: databasePath ? [{ dbPath: databasePath }] : undefined
        }),
        timeout
    ])
        .then(toEphemeralMongo)
        .catch((error: unknown) => {
            logger.error(error);
            return process.exit(1);
        })
        .finally(() => clearTimeout(timer));
};
