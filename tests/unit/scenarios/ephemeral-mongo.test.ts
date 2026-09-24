/**
 * `startEphemeralMongo` — the three-way resolver: an external URI wins outright, otherwise the
 * pre-installed-binary check runs before handing off to the caller's `startInProcess`.
 *
 * `startInProcess` is a plain `jest.fn()` here, never a real `mongodb-memory-server` boot — a real
 * boot belongs to the integration suites that already exercise one through
 * `scenarios/support/ephemeral-mongod.ts` (`tests/integration/app-health.test.ts`).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startEphemeralMongo, type EphemeralMongo } from '@scenarios/support/ephemeral-mongo';

const startInProcess = jest.fn(
    (_dbPath: string | undefined): Promise<EphemeralMongo> =>
        Promise.resolve({ uri: 'mongodb://127.0.0.1:1/ephemeral', stop: () => Promise.resolve() })
);

/** Externally configurable, restored to whatever this run's own environment set them to. */
const RESTORED_ENV_KEYS = ['NODE_TEST_MONGO_URI', 'MONGOMS_SYSTEM_BINARY'] as const;

/**
 * `usePreinstalledBinary`'s own derived bookkeeping — never legitimately pre-existing config, so
 * always cleared rather than "restored". `globalSetup` calls the same function to boot the REAL
 * ephemeral Mongo every suite shares, and does it in the process these tests' own worker forked
 * from — so when `MONGOMS_SYSTEM_BINARY` names a binary that genuinely exists on the machine,
 * these two are ALREADY 'false' by the time this file's module scope runs, and capturing that as
 * the "original" to restore would poison every case after the one that legitimately sets them.
 */
const CLEARED_ENV_KEYS = ['MONGOMS_SYSTEM_BINARY_VERSION_CHECK', 'MONGOMS_MD5_CHECK'] as const;

/** Every externally configurable var, saved so each case restores exactly what it found. */
const ORIGINAL = Object.fromEntries(RESTORED_ENV_KEYS.map((key) => [key, process.env[key]]));

// A clean slate regardless of run order: a mutation run's `enableFindRelatedTests` can run any
// one of these cases alone, with no earlier `afterEach` in this file to have cleared them first.
beforeEach(() => {
    for (const key of CLEARED_ENV_KEYS) delete process.env[key];
});

afterEach(() => {
    startInProcess.mockClear();
    for (const key of RESTORED_ENV_KEYS) {
        if (ORIGINAL[key] === undefined) delete process.env[key];
        else process.env[key] = ORIGINAL[key];
    }
    for (const key of CLEARED_ENV_KEYS) delete process.env[key];
});

describe('startEphemeralMongo', () => {
    it('uses NODE_TEST_MONGO_URI when set, and never calls startInProcess', async () => {
        delete process.env.MONGOMS_SYSTEM_BINARY;
        process.env.NODE_TEST_MONGO_URI = 'mongodb://compose-mongo:27017/test-suite';

        const mongo = await startEphemeralMongo({ startInProcess });

        expect(mongo.uri).toBe('mongodb://compose-mongo:27017/test-suite');
        expect(startInProcess).not.toHaveBeenCalled();
    });

    it('stop() is a no-op on the external path', async () => {
        process.env.NODE_TEST_MONGO_URI = 'mongodb://compose-mongo:27017/test-suite';

        const mongo = await startEphemeralMongo({ startInProcess });

        await expect(mongo.stop()).resolves.toBeUndefined();
    });

    it('sets the skip-download vars when a pre-installed binary exists, before calling startInProcess', async () => {
        delete process.env.NODE_TEST_MONGO_URI;
        const directory = mkdtempSync(path.join(tmpdir(), 'mongod-binary-test-'));
        const binary = path.join(directory, 'mongod');
        writeFileSync(binary, '');
        process.env.MONGOMS_SYSTEM_BINARY = binary;

        try {
            await startEphemeralMongo({ startInProcess });

            expect(process.env.MONGOMS_SYSTEM_BINARY).toBe(binary);
            expect(process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK).toBe('false');
            expect(process.env.MONGOMS_MD5_CHECK).toBe('false');
            expect(startInProcess).toHaveBeenCalledTimes(1);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('leaves an overridden but non-existent binary path unset', async () => {
        delete process.env.NODE_TEST_MONGO_URI;
        process.env.MONGOMS_SYSTEM_BINARY = '/definitely/not/a/real/path/mongod';

        await startEphemeralMongo({ startInProcess });

        expect(process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK).toBeUndefined();
        expect(process.env.MONGOMS_MD5_CHECK).toBeUndefined();
    });

    it('passes a given dbPath through to startInProcess', async () => {
        delete process.env.NODE_TEST_MONGO_URI;
        delete process.env.MONGOMS_SYSTEM_BINARY;

        await startEphemeralMongo({ dbPath: '/tmp/some-db-path', startInProcess });

        expect(startInProcess).toHaveBeenCalledWith('/tmp/some-db-path');
    });
});
