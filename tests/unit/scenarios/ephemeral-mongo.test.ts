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
import { setProcessEnvironment } from '@tests/environment';

const startInProcess = jest.fn(
    (_dbPath: string | undefined): Promise<EphemeralMongo> =>
        Promise.resolve({ uri: 'mongodb://127.0.0.1:1/ephemeral', stop: () => Promise.resolve() })
);

/**
 * `usePreinstalledBinary`'s own derived bookkeeping — never legitimately pre-existing config, so
 * always cleared before a case. `globalSetup` calls the same function to boot the REAL
 * ephemeral Mongo every suite shares, and does it in the process these tests' own worker forked
 * from — so when `MONGOMS_SYSTEM_BINARY` names a binary that genuinely exists on the machine,
 * these two are ALREADY 'false' by the time this file's module scope runs, and capturing that as
 * the "original" to restore would poison every case after the one that legitimately sets them.
 */
const CLEARED_ENV_KEYS = ['MONGOMS_SYSTEM_BINARY_VERSION_CHECK', 'MONGOMS_MD5_CHECK'] as const;

// A clean slate regardless of run order: a mutation run's `enableFindRelatedTests` can run any
// one of these cases alone, with no earlier `afterEach` in this file to have cleared them first.
beforeEach(() => {
    setProcessEnvironment(Object.fromEntries(CLEARED_ENV_KEYS.map((key) => [key, undefined])));
});

afterEach(() => {
    startInProcess.mockClear();
});

describe('startEphemeralMongo', () => {
    it('uses NODE_TEST_MONGO_URI when set, and never calls startInProcess', async () => {
        setProcessEnvironment({ MONGOMS_SYSTEM_BINARY: undefined });
        setProcessEnvironment({ NODE_TEST_MONGO_URI: 'mongodb://compose-mongo:27017/test-suite' });

        const mongo = await startEphemeralMongo({ startInProcess });

        expect(mongo.uri).toBe('mongodb://compose-mongo:27017/test-suite');
        expect(startInProcess).not.toHaveBeenCalled();
    });

    it('stop() is a no-op on the external path', async () => {
        setProcessEnvironment({ NODE_TEST_MONGO_URI: 'mongodb://compose-mongo:27017/test-suite' });

        const mongo = await startEphemeralMongo({ startInProcess });

        await expect(mongo.stop()).resolves.toBeUndefined();
    });

    it('sets the skip-download vars when a pre-installed binary exists, before calling startInProcess', async () => {
        setProcessEnvironment({ NODE_TEST_MONGO_URI: undefined });
        const directory = mkdtempSync(path.join(tmpdir(), 'mongod-binary-test-'));
        const binary = path.join(directory, 'mongod');
        writeFileSync(binary, '');
        setProcessEnvironment({ MONGOMS_SYSTEM_BINARY: binary });

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
        setProcessEnvironment({ NODE_TEST_MONGO_URI: undefined });
        setProcessEnvironment({ MONGOMS_SYSTEM_BINARY: '/definitely/not/a/real/path/mongod' });

        await startEphemeralMongo({ startInProcess });

        expect(process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK).toBeUndefined();
        expect(process.env.MONGOMS_MD5_CHECK).toBeUndefined();
    });

    it('passes a given dbPath through to startInProcess', async () => {
        setProcessEnvironment({ NODE_TEST_MONGO_URI: undefined });
        setProcessEnvironment({ MONGOMS_SYSTEM_BINARY: undefined });

        await startEphemeralMongo({ dbPath: '/tmp/some-db-path', startInProcess });

        expect(startInProcess).toHaveBeenCalledWith('/tmp/some-db-path');
    });
});
