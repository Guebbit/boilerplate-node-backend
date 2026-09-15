/**
 * @module
 * Where a suite (or the demo profile) gets a Mongo to talk to — the branching only.
 *
 * Mirrors `tests/cluster/support/redis.ts`'s `startRedis()` on purpose, so the two read as one
 * pattern — env var first, local fallback second — but the fallback shapes differ:
 *
 * **Redis has no in-process option, Mongo does.** Redis's fallback shells out to a container
 * engine; Mongo's fallback is `mongodb-memory-server`, an in-process binary with no engine
 * dependency. There is deliberately no third, container-per-run branch for Mongo — its only
 * unique use case ("an engine is available but downloading a binary is not wanted") is not a
 * capability either existing path lacks, and it is the one branch that would make a container
 * engine mandatory just to run a test.
 *
 * Actually starting one is NOT this module's job, on purpose: `mongodb-memory-server` is a
 * devDependency, and `not-to-dev-dep` (`.dependency-cruiser.cjs`) bars anything under `src/` from
 * reaching one — a production install runs `npm ci --omit=dev` and this file ships there. Every
 * caller supplies that half as `startInProcess`; the one shared implementation lives in
 * `tests/support/ephemeral-mongod.ts`, which `scenarios/run-server.ts` cannot import
 * (`eslint-plugin-boundaries` bars `scenarios/` from reaching `tests/`) and so keeps its own copy.
 */

import { existsSync } from 'node:fs';
// Relative, not the `@infrastructure` alias: this module is loaded from `tests/support/
// global-setup.ts`, which jest loads outside its normal module resolution — `moduleNameMapper`
// does not apply there, so the alias would resolve at `tsc`/`eslint` time and fail at runtime.
import { logger } from '../adapters/logger';

/** A running Mongo, and the way to stop it. */
export interface EphemeralMongo {
    uri: string;
    stop: () => Promise<void>;
}

/**
 * Points `mongodb-memory-server` at a pre-installed `mongod` when `MONGOMS_SYSTEM_BINARY` names
 * one on disk, so it skips its own ~100 MB first-run download. A no-op when the variable is unset
 * or the named binary is absent — the library then downloads its own copy (or reuses whatever it
 * finds cached under `MONGOMS_DOWNLOAD_DIR`, which `docker/Dockerfile` bakes at build time).
 *
 * Pure env-var bookkeeping, not a call into the library itself — this is what stays safe to do
 * from `src/`. Must run in the same process that calls `startInProcess`, and before it: this is
 * what `bf615b00` fixed after the vars were set too late to matter.
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
 * `NODE_TEST_MONGO_URI` wins when set — a database already listening, such as CI's own service
 * container or a developer's compose stack. Otherwise starts an in-process `mongod` through
 * `startInProcess`, taking a pre-installed binary over `mongodb-memory-server`'s own download when
 * one is on disk.
 *
 * @param options.dbPath - where the in-process server keeps its data; ignored on the external
 * path. The caller owns this directory's lifecycle — see `tests/support/global-setup.ts`.
 * @param options.startInProcess - actually starts a `mongod`; never called on the external path.
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
