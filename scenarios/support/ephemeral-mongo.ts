/**
 * @module
 * Where a suite (or the demo profile) gets a Mongo to talk to: the branching only. Mirrors
 * `tests/cluster/support/redis.ts`'s `startRedis()` (env var first, local fallback second).
 *
 * Fallback:  Redis has no in-process option, so it shells out to a container engine; Mongo uses
 *            `mongodb-memory-server`, an in-process binary. There is no container-per-run branch:
 *            its one use ("an engine is available but downloading a binary is not wanted") is a
 *            capability neither path lacks, and it would make an engine mandatory to run a test.
 * Starting:  not this module's job. `./ephemeral-mongod.ts` is the one implementation, and every
 *            caller (`scenarios/run-server.ts`, `tests/support/global-setup.ts`,
 *            `tests/cluster/support/cluster.ts`) passes `startInProcessMongod` itself.
 * Required:  `startInProcess` has no default, so this file never statically imports
 *            `./ephemeral-mongod`: `unit-layer-stays-database-free` (`.dependency-cruiser.cjs`) is
 *            reachability-based, and a default would pull `mongodb-memory-server` into the unit
 *            test's graph although it always passes a fake. `not-to-dev-dep` bars only `src/`.
 */

import { existsSync } from 'node:fs';
/**
 * Relative, not the `@infrastructure` alias: this module is loaded from `tests/support/
 * global-setup.ts`, which jest loads outside its normal module resolution — `moduleNameMapper`
 * does not apply there, so the alias would resolve at `tsc`/`eslint` time and fail at runtime.
 */
import { logger } from '../../src/infrastructure/adapters/logger';

/** A running Mongo, and the way to stop it. */
export interface EphemeralMongo {
    /** Connection string for the running server. */
    uri: string;
    /** Shuts it down and removes its data. */
    stop: () => Promise<void>;
}

/**
 * Points `mongodb-memory-server` at a pre-installed `mongod` when `MONGOMS_SYSTEM_BINARY` names
 * one on disk, so it skips its own ~100 MB first-run download. A no-op when the variable is unset
 * or the named binary is absent — the library then downloads its own copy (or reuses whatever it
 * finds cached under `MONGOMS_DOWNLOAD_DIR`, which the `dev` stage of `docker/Dockerfile` bakes at build time).
 *
 * Pure env-var bookkeeping, not a call into the library itself — this is what stays safe to do
 * from `src/`. Must run in the same process that calls `startInProcess`, and before it, or the
 * vars are set too late for the library to read them.
 */
const usePreinstalledBinary = (): void => {
    const systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
    if (!systemBinary || !existsSync(systemBinary)) return;

    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
};

/**
 * Resolves a Mongo to test or demo against.
 *
 * `NODE_TEST_MONGO_URI` wins when set — a database already listening, such as a developer's
 * compose stack. Otherwise starts an in-process `mongod` through
 * `startInProcess`, taking a pre-installed binary over `mongodb-memory-server`'s own download when
 * one is on disk.
 *
 * @param options.dbPath - where the in-process server keeps its data; ignored on the external
 * path. The caller owns this directory's lifecycle — see `tests/support/global-setup.ts`.
 * @param options.startInProcess - actually starts a `mongod`; never called on the external path.
 * A real caller passes the real `startInProcessMongod` (`./ephemeral-mongod`); a unit test passes
 * a fake — see this module's own docblock for why there is no default.
 * @returns the uri to connect with, and how to stop whatever this started
 */
export const startEphemeralMongo = (options: {
    dbPath?: string;
    startInProcess: (databasePath: string | undefined) => Promise<EphemeralMongo>;
}): Promise<EphemeralMongo> => {
    const external = process.env.NODE_TEST_MONGO_URI?.trim();
    if (external) {
        logger.info('[mongo] external — using NODE_TEST_MONGO_URI');
        return Promise.resolve({ uri: external, stop: () => Promise.resolve() });
    }

    usePreinstalledBinary();
    logger.info('[mongo] ephemeral — starting an in-process mongod');
    return options.startInProcess(options.dbPath);
};
